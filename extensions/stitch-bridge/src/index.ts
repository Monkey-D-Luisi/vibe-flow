import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { callStitchMcp } from './stitch-client.js';
import type { StitchConfig } from './stitch-client.js';

/**
 * Stitch MCP Bridge Plugin
 *
 * Registers design tools (design.generate, design.edit, design.get, design.list)
 * by proxying to the Google Stitch MCP endpoint. The designer agent uses these
 * tools to create/edit screen designs that frontend devs then implement.
 */

function getConfig(api: OpenClawPluginApi): StitchConfig {
  const cfg = api.pluginConfig as Record<string, unknown>;
  return {
    endpoint: String(cfg?.['endpoint'] ?? 'https://stitch.googleapis.com/mcp'),
    defaultProjectId: String(cfg?.['defaultProjectId'] ?? ''),
    defaultModel: String(cfg?.['defaultModel'] ?? 'GEMINI_3_PRO'),
    timeoutMs: Number(cfg?.['timeoutMs'] ?? 60000),
    designDir: String(cfg?.['designDir'] ?? '.stitch-html'),
  };
}

async function ensureDesignDir(workspace: string, designDir: string): Promise<string> {
  const dir = join(workspace, designDir);
  await mkdir(dir, { recursive: true });
  return dir;
}

export default {
  id: 'stitch-bridge',
  name: 'Stitch MCP Bridge',
  description: 'Proxy Google Stitch design tools for the designer agent',

  register(api: OpenClawPluginApi) {
    const config = getConfig(api);
    const logger = api.logger;

    // ── design.generate ──
    api.registerTool({
      name: 'design.generate',
      label: 'Generate Design',
      description: 'Generate a UI screen design via Google Stitch',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'Stitch project ID (defaults to config)' },
          screenName: { type: 'string', description: 'Name for the screen (used as filename)' },
          description: { type: 'string', description: 'Natural language description of the screen' },
          modelId: { type: 'string', description: 'Stitch model (defaults to GEMINI_3_PRO)' },
        },
        required: ['screenName', 'description'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const projectId = String(params['projectId'] ?? config.defaultProjectId);
        const screenName = String(params['screenName']);
        const description = String(params['description']);
        const modelId = String(params['modelId'] ?? config.defaultModel);

        const result = await callStitchMcp(config, 'generate_screen_from_text', {
          projectId,
          prompt: description,
          modelId,
        });

        const html = String((result as Record<string, unknown>)?.['html'] ?? result);
        const workspace = String(params['workspace'] ?? '/workspaces/active');
        const dir = await ensureDesignDir(workspace, config.designDir);
        const filePath = join(dir, `${screenName}.html`);
        await writeFile(filePath, html, 'utf-8');

        logger.info(`stitch-bridge: Generated design for "${screenName}" → ${filePath}`);

        const output = {
          screenId: String((result as Record<string, unknown>)?.['screenId'] ?? screenName),
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
      name: 'design.edit',
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
        const projectId = String(params['projectId'] ?? config.defaultProjectId);
        const screenId = String(params['screenId']);
        const screenName = String(params['screenName'] ?? screenId);
        const editPrompt = String(params['editPrompt']);

        const result = await callStitchMcp(config, 'edit_screens', {
          projectId,
          screenId,
          prompt: editPrompt,
        });

        const html = String((result as Record<string, unknown>)?.['html'] ?? result);
        const workspace = String(params['workspace'] ?? '/workspaces/active');
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

    // ── design.get ──
    api.registerTool({
      name: 'design.get',
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
        const screenName = String(params['screenName']);
        const workspace = String(params['workspace'] ?? '/workspaces/active');
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
      name: 'design.list',
      label: 'List Designs',
      description: 'List all saved Stitch designs in the workspace',
      parameters: {
        type: 'object',
        properties: {},
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const workspace = String(params['workspace'] ?? '/workspaces/active');
        const dir = join(workspace, config.designDir);

        let files: string[];
        try {
          files = await readdir(dir);
        } catch {
          const output = { designs: [] as unknown[] };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
            details: output,
          };
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

    logger.info('stitch-bridge: Registered design tools (generate, edit, get, list)');
  },
};
