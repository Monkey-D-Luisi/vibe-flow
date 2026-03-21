import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, basename, resolve, isAbsolute } from 'node:path';
import { callStitchMcp, listTools } from './stitch-client.js';
import type { StitchConfig } from './stitch-client.js';

/**
 * Stitch MCP Bridge Plugin
 *
 * Registers design tools (design.generate, design.edit, design.get, design.list)
 * by proxying to the Google Stitch MCP endpoint. The designer agent uses these
 * tools to create/edit screen designs that frontend devs then implement.
 */

const DEFAULT_WORKSPACE = '/workspaces/active';

const VALID_CREATIVE_RANGES = new Set(['REFINE', 'EXPLORE', 'REIMAGINE']);
const VALID_ASPECTS = new Set(['LAYOUT', 'COLOR_SCHEME', 'IMAGES', 'TEXT_FONT', 'TEXT_CONTENT']);

function getConfig(api: OpenClawPluginApi): StitchConfig {
  const cfg = api.pluginConfig as Record<string, unknown>;
  return {
    endpoint: String(cfg?.['endpoint'] ?? 'https://stitch.googleapis.com/mcp'),
    defaultProjectId: String(cfg?.['defaultProjectId'] ?? ''),
    defaultModel: String(cfg?.['defaultModel'] ?? 'GEMINI_3_1_PRO'),
    timeoutMs: Number(cfg?.['timeoutMs'] ?? 120000),
    designDir: String(cfg?.['designDir'] ?? '.stitch-html'),
  };
}

/** Validate a download URL belongs to the configured Stitch origin (SSRF protection). */
function assertTrustedUrl(url: string, config: StitchConfig): void {
  let urlOrigin: string;
  try {
    urlOrigin = new URL(url).origin;
  } catch {
    throw new Error(`Invalid download URL: "${url}"`);
  }
  const configOrigin = new URL(config.endpoint).origin;
  if (urlOrigin !== configOrigin) {
    throw new Error(`Untrusted download URL origin "${urlOrigin}" (expected "${configOrigin}")`);
  }
}

async function ensureDesignDir(workspace: string, designDir: string): Promise<string> {
  const dir = join(workspace, designDir);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Sanitize screenName to prevent path traversal. */
function sanitizeScreenName(raw: string): string {
  const name = basename(raw);
  if (!name || name === '.' || name === '..') {
    throw new Error(`Invalid screenName: "${raw}"`);
  }
  return name;
}

/** Navigate a nested Stitch response to find the first screen's resource name. */
function findScreenResourceName(result: unknown): string | undefined {
  const obj = result as Record<string, unknown>;
  const components = obj?.['outputComponents'];
  if (!Array.isArray(components)) return undefined;
  for (const comp of components) {
    const design = (comp as Record<string, unknown>)?.['design'] as Record<string, unknown> | undefined;
    const screens = design?.['screens'];
    if (!Array.isArray(screens)) continue;
    for (const screen of screens) {
      const name = (screen as Record<string, unknown>)?.['name'];
      if (typeof name === 'string' && name) return name;
    }
  }
  return undefined;
}

/** Navigate a nested Stitch response to find the first screen's htmlCode downloadUrl. */
function findHtmlDownloadUrl(result: unknown): string | undefined {
  const obj = result as Record<string, unknown>;
  const components = obj?.['outputComponents'];
  if (!Array.isArray(components)) return undefined;
  for (const comp of components) {
    const design = (comp as Record<string, unknown>)?.['design'] as Record<string, unknown> | undefined;
    const screens = design?.['screens'];
    if (!Array.isArray(screens)) continue;
    for (const screen of screens) {
      const htmlCode = (screen as Record<string, unknown>)?.['htmlCode'] as Record<string, unknown> | undefined;
      const url = htmlCode?.['downloadUrl'];
      if (typeof url === 'string' && url) return url;
    }
  }
  return undefined;
}

/** Extract html string from Stitch result, fetching from downloadUrl if needed. */
async function extractHtml(result: unknown, config: StitchConfig): Promise<string> {
  const obj = result as Record<string, unknown>;

  // Direct html field (legacy / mock format)
  const directHtml = obj?.['html'];
  if (typeof directHtml === 'string' && directHtml) return directHtml;

  // Stitch MCP format: outputComponents[].design.screens[].htmlCode.downloadUrl
  const downloadUrl = findHtmlDownloadUrl(result);
  if (downloadUrl) {
    assertTrustedUrl(downloadUrl, config);
    const resp = await fetch(downloadUrl);
    if (!resp.ok) {
      throw new Error(`Failed to download HTML from Stitch: ${resp.status}`);
    }
    const html = await resp.text();
    if (!html) throw new Error('Stitch HTML download returned empty content');
    return html;
  }

  throw new Error(`Stitch MCP response missing html field. Keys: ${Object.keys(obj ?? {}).join(', ')}`);
}

/** Extract all variant HTML strings from a Stitch generate_variants response.
 *  Uses global `fetch` (requires Node 18+ or a polyfill). */
async function extractVariantHtmls(
  result: unknown,
  config: StitchConfig,
): Promise<{ variants: { name: string; html: string }[]; warnings: string[] }> {
  const obj = result as Record<string, unknown>;
  const components = obj?.['outputComponents'];
  if (!Array.isArray(components)) return { variants: [], warnings: [] };

  const variants: { name: string; html: string }[] = [];
  const warnings: string[] = [];
  let index = 1;
  for (const comp of components) {
    const design = (comp as Record<string, unknown>)?.['design'] as Record<string, unknown> | undefined;
    const screens = design?.['screens'];
    if (!Array.isArray(screens)) continue;
    for (const screen of screens) {
      const screenObj = screen as Record<string, unknown>;
      const variantName = `variant-${index}`;
      const htmlCode = screenObj['htmlCode'] as Record<string, unknown> | undefined;
      const downloadUrl = htmlCode?.['downloadUrl'];
      if (typeof downloadUrl === 'string' && downloadUrl) {
        try {
          assertTrustedUrl(downloadUrl, config);
          const resp = await fetch(downloadUrl);
          if (resp.ok) {
            const html = await resp.text();
            if (html) variants.push({ name: variantName, html });
            else warnings.push(`${variantName}: download returned empty content`);
          } else {
            warnings.push(`${variantName}: download failed with HTTP ${resp.status}`);
          }
        } catch (err: unknown) {
          warnings.push(`${variantName}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      index++;
    }
  }
  return { variants, warnings };
}

/** Strip "projects/" prefix from Stitch resource names so tools receive bare numeric IDs. */
function normalizeProjectId(raw: string): string {
  return raw.replace(/^projects\//, '');
}

/** Validate workspace is an absolute path with no traversal segments. */
function validateWorkspace(raw: string): string {
  if (!isAbsolute(raw)) {
    throw new Error(`Invalid workspace: must be an absolute path, got "${raw}"`);
  }
  const resolved = resolve(raw);
  // After resolve, check the canonical path doesn't differ from what we expect
  // (resolve normalizes away ".." segments). If raw contained "..", resolved
  // will differ — compare to detect traversal.
  if (raw.includes('..')) {
    throw new Error(`Invalid workspace: path traversal detected in "${raw}"`);
  }
  return resolved;
}

export default {
  id: 'stitch-bridge',
  name: 'Stitch MCP Bridge',
  description: 'Proxy Google Stitch design tools for the designer agent',

  register(api: OpenClawPluginApi) {
    const config = getConfig(api);
    const logger = api.logger;
    const slog = (level: 'info' | 'warn' | 'error', op: string, ctx?: Record<string, unknown>) =>
      logger[level](JSON.stringify({ ts: new Date().toISOString(), level, ext: 'stitch-bridge', op, ...ctx }));

    // ── design.generate ──
    api.registerTool({
      name: 'design_generate',
      label: 'Generate Design',
      description: 'Generate a UI screen design via Google Stitch',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Stitch project ID (defaults to config)' },
          screenName: { type: 'string', description: 'Name for the screen (used as filename)' },
          description: { type: 'string', description: 'Natural language description of the screen' },
          modelId: { type: 'string', description: 'Stitch model (defaults to GEMINI_3_1_PRO)' },
          deviceType: { type: 'string', description: 'Device type: DESKTOP (default), MOBILE, TABLET, AGNOSTIC', enum: ['DESKTOP', 'MOBILE', 'TABLET', 'AGNOSTIC'] },
        },
        required: ['screenName', 'description'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const projectId = normalizeProjectId(String(params['projectId'] ?? config.defaultProjectId));
        const screenName = sanitizeScreenName(String(params['screenName']));
        const description = String(params['description']);
        const modelId = String(params['modelId'] ?? config.defaultModel);
        const deviceType = String(params['deviceType'] ?? 'DESKTOP');

        const result = await callStitchMcp(config, 'generate_screen_from_text', {
          projectId,
          prompt: description,
          modelId,
          deviceType,
        });

        const html = await extractHtml(result, config);
        const workspace = validateWorkspace(String(params['workspace'] ?? DEFAULT_WORKSPACE));
        const dir = await ensureDesignDir(workspace, config.designDir);
        const filePath = join(dir, `${screenName}.html`);
        await writeFile(filePath, html, 'utf-8');

        logger.info(`stitch-bridge: Generated design for "${screenName}" → ${filePath}`);

        // Extract screenId from Stitch response (resource name path or direct field or fallback)
        const screenId = findScreenResourceName(result)
          ?? String((result as Record<string, unknown>)?.['screenId'] ?? screenName);
        const output = {
          screenId,
          html,
          savedTo: filePath,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          details: output,
        };
      },
    });

    // ── design.edit ──
    api.registerTool({
      name: 'design_edit',
      label: 'Edit Design',
      description: 'Edit an existing Stitch screen design',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string' },
          screenId: { type: 'string', description: 'Screen ID from Stitch' },
          screenName: { type: 'string', description: 'Screen name (for saving)' },
          editPrompt: { type: 'string', description: 'Description of changes to make' },
        },
        required: ['screenId', 'editPrompt'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const projectId = normalizeProjectId(String(params['projectId'] ?? config.defaultProjectId));
        const screenId = String(params['screenId']);
        const screenName = sanitizeScreenName(String(params['screenName'] ?? screenId));
        const editPrompt = String(params['editPrompt']);

        const result = await callStitchMcp(config, 'edit_screens', {
          projectId,
          screenId,
          prompt: editPrompt,
        });

        const html = await extractHtml(result, config);
        const workspace = validateWorkspace(String(params['workspace'] ?? DEFAULT_WORKSPACE));
        const dir = await ensureDesignDir(workspace, config.designDir);
        const filePath = join(dir, `${screenName}.html`);
        await writeFile(filePath, html, 'utf-8');

        logger.info(`stitch-bridge: Edited design "${screenName}" → ${filePath}`);

        const output = { html, savedTo: filePath };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          details: output,
        };
      },
    });

    // ── design.variant ──
    api.registerTool({
      name: 'design_variant',
      label: 'Generate Design Variants',
      description: 'Generate alternative design variants for A/B exploration',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Stitch project ID (defaults to config)' },
          screenIds: { type: 'array', items: { type: 'string' }, description: 'Screen IDs to generate variants for' },
          screenName: { type: 'string', description: 'Base name prefix for saved variant files' },
          prompt: { type: 'string', description: 'Prompt describing the variant direction' },
          variantCount: { type: 'number', description: 'Number of variants (1-5, default 3)' },
          creativeRange: { type: 'string', description: 'REFINE, EXPLORE (default), or REIMAGINE', enum: ['REFINE', 'EXPLORE', 'REIMAGINE'] },
          aspects: { type: 'array', items: { type: 'string' }, description: 'Aspects to vary: LAYOUT, COLOR_SCHEME, IMAGES, TEXT_FONT, TEXT_CONTENT' },
          deviceType: { type: 'string', description: 'Device type: DESKTOP (default), MOBILE, TABLET, AGNOSTIC', enum: ['DESKTOP', 'MOBILE', 'TABLET', 'AGNOSTIC'] },
        },
        required: ['screenIds', 'prompt'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const projectId = normalizeProjectId(String(params['projectId'] ?? config.defaultProjectId));

        // Validate screenIds (#2)
        const rawScreenIds = params['screenIds'];
        if (!Array.isArray(rawScreenIds) || rawScreenIds.length === 0 ||
            rawScreenIds.some((s: unknown) => typeof s !== 'string')) {
          throw new Error('screenIds must be a non-empty array of strings');
        }
        const screenIds = rawScreenIds as string[];

        const screenName = sanitizeScreenName(String(params['screenName'] ?? 'design'));
        const prompt = String(params['prompt']);

        // Clamp variantCount to 1-5 (#3)
        const rawCount = Number(params['variantCount'] ?? 3);
        const variantCount = Math.max(1, Math.min(5, Number.isFinite(rawCount) ? Math.floor(rawCount) : 3));

        // Validate creativeRange (#11)
        const rawCreativeRange = String(params['creativeRange'] ?? 'EXPLORE');
        if (!VALID_CREATIVE_RANGES.has(rawCreativeRange)) {
          throw new Error(`Invalid creativeRange "${rawCreativeRange}". Must be one of: ${[...VALID_CREATIVE_RANGES].join(', ')}`);
        }
        const creativeRange = rawCreativeRange;

        // Validate aspects (#10)
        const rawAspects = Array.isArray(params['aspects'])
          ? (params['aspects'] as unknown[]).filter((a): a is string => typeof a === 'string')
          : [];
        for (const aspect of rawAspects) {
          if (!VALID_ASPECTS.has(aspect)) {
            throw new Error(`Invalid aspect "${aspect}". Must be one of: ${[...VALID_ASPECTS].join(', ')}`);
          }
        }
        const aspects = rawAspects;

        const deviceType = String(params['deviceType'] ?? 'DESKTOP');

        const variantOptions: Record<string, unknown> = { variantCount, creativeRange };
        if (aspects.length > 0) variantOptions['aspects'] = aspects;

        const result = await callStitchMcp(config, 'generate_variants', {
          projectId,
          selectedScreenIds: screenIds,
          prompt,
          variantOptions,
          deviceType,
          modelId: config.defaultModel,
        });

        const { variants: variantHtmls, warnings } = await extractVariantHtmls(result, config);
        const workspace = validateWorkspace(String(params['workspace'] ?? DEFAULT_WORKSPACE));
        const dir = await ensureDesignDir(workspace, config.designDir);

        const saved: { index: number; savedTo: string }[] = [];
        for (let i = 0; i < variantHtmls.length; i++) {
          const filePath = join(dir, `${screenName}-variant-${i + 1}.html`);
          await writeFile(filePath, variantHtmls[i].html, 'utf-8');
          saved.push({ index: i + 1, savedTo: filePath });
        }

        slog('info', 'design_variant.generated', { screenName, count: saved.length });
        if (warnings.length > 0) {
          slog('warn', 'design_variant.warnings', { screenName, warnings });
        }

        const output: Record<string, unknown> = { variants: saved, count: saved.length };
        if (warnings.length > 0) output['warnings'] = warnings;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          details: output,
        };
      },
    });

    // ── design.get ──
    api.registerTool({
      name: 'design_get',
      label: 'Get Design',
      description: 'Read a saved Stitch design from the workspace',
      parameters: {
        type: 'object',
        properties: {
          screenName: { type: 'string', description: 'Screen name (filename without .html)' },
        },
        required: ['screenName'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const screenName = sanitizeScreenName(String(params['screenName']));
        const workspace = validateWorkspace(String(params['workspace'] ?? DEFAULT_WORKSPACE));
        const filePath = join(workspace, config.designDir, `${screenName}.html`);

        const html = await readFile(filePath, 'utf-8');
        const output = { html, path: filePath };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          details: output,
        };
      },
    });

    // ── design.list ──
    api.registerTool({
      name: 'design_list',
      label: 'List Designs',
      description: 'List all saved Stitch designs in the workspace',
      parameters: {
        type: 'object',
        properties: {},
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const workspace = validateWorkspace(String(params['workspace'] ?? DEFAULT_WORKSPACE));
        const dir = join(workspace, config.designDir);

        let files: string[];
        try {
          files = await readdir(dir);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            const output = { designs: [] as unknown[] };
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
              details: output,
            };
          }
          logger.warn(`stitch-bridge: design.list readdir failed: ${String(err)}`);
          throw err;
        }

        const designs = [];
        for (const file of files) {
          if (!file.endsWith('.html')) continue;
          const filePath = join(dir, file);
          const stats = await stat(filePath);
          designs.push({
            name: basename(file, '.html'),
            path: filePath,
            modifiedAt: stats.mtime.toISOString(),
          });
        }

        const output = { designs };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          details: output,
        };
      },
    });

    slog('info', 'design_tools.registered');

    // ── design.project_create ──
    api.registerTool({
      name: 'design_project_create',
      label: 'Create Stitch Project',
      description: 'Create a new Stitch project to hold screen designs',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Project title' },
        },
        required: ['title'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const title = String(params['title']);
        const result = await callStitchMcp(config, 'create_project', { title });
        const obj = result as Record<string, unknown>;
        const output = {
          projectId: normalizeProjectId(String(obj?.['name'] ?? '')),
          title: String(obj?.['title'] ?? title),
          raw: result,
        };
        logger.info(`stitch-bridge: Created project "${title}" → ${output.projectId}`);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          details: output,
        };
      },
    });

    // ── design.project_list ──
    api.registerTool({
      name: 'design_project_list',
      label: 'List Stitch Projects',
      description: 'List all Stitch projects',
      parameters: {
        type: 'object',
        properties: {},
      },
      async execute() {
        const result = await callStitchMcp(config, 'list_projects', {});
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      },
    });

    // ── design.screens_list ──
    api.registerTool({
      name: 'design_screens_list',
      label: 'List Stitch Screens',
      description: 'List all screens in a Stitch project (from Stitch API, not local files)',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Stitch project ID' },
        },
        required: ['projectId'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const projectId = normalizeProjectId(String(params['projectId']));
        const result = await callStitchMcp(config, 'list_screens', { projectId });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      },
    });

    slog('info', 'project_tools.registered');

    // Discover available Stitch tools in the background (non-blocking).
    if (process.env['STITCH_API_KEY'] && typeof listTools === 'function') {
      Promise.resolve()
        .then(() => listTools(config))
        .then((result) => {
          const tools = (result as Record<string, unknown>)?.['tools'];
          if (Array.isArray(tools)) {
            const names = tools.map((t: Record<string, unknown>) => t['name']).join(', ');
            logger.info(`stitch-bridge: Discovered ${tools.length} Stitch tools: ${names}`);
          }
        })
        .catch((err: unknown) => {
          logger.warn(`stitch-bridge: Could not discover Stitch tools: ${String(err)}`);
        });
    }
  },
};
