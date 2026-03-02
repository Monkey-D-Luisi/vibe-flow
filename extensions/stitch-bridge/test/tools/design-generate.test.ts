import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/stitch-client.js', () => ({
  callStitchMcp: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

import { callStitchMcp } from '../../src/stitch-client.js';
import * as fsMock from 'node:fs/promises';
import plugin from '../../src/index.js';

type ToolExecuteFn = (id: string, params: Record<string, unknown>) => Promise<unknown>;

function makeApi(configOverrides: Record<string, unknown> = {}) {
  const tools = new Map<string, ToolExecuteFn>();
  const api = {
    pluginConfig: {
      endpoint: 'https://stitch.googleapis.com/mcp',
      defaultProjectId: 'proj-test',
      defaultModel: 'GEMINI_3_PRO',
      timeoutMs: 5000,
      designDir: '.stitch-html',
      ...configOverrides,
    },
    registerTool: vi.fn(({ name, execute }: { name: string; execute: ToolExecuteFn }) => {
      tools.set(name, execute);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  return { api, getTool: (name: string) => tools.get(name) };
}

describe('design_generate tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fsMock.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsMock.writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls Stitch MCP and saves HTML to workspace', async () => {
    const stitchResult = { html: '<html><body>Login</body></html>', screenId: 'scr-abc' };
    vi.mocked(callStitchMcp).mockResolvedValue(stitchResult);

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const generate = getTool('design_generate')!;
    const result = await generate('call-1', {
      screenName: 'login',
      description: 'A login screen',
      workspace: '/workspace/myproject',
    }) as { details: { screenId: string; html: string; savedTo: string } };

    expect(callStitchMcp).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://stitch.googleapis.com/mcp' }),
      'generate_screen_from_text',
      expect.objectContaining({ prompt: 'A login screen', modelId: 'GEMINI_3_PRO' }),
    );
    expect(fsMock.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('.stitch-html'),
      { recursive: true },
    );
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('login.html'),
      '<html><body>Login</body></html>',
      'utf-8',
    );
    expect(result.details.screenId).toBe('scr-abc');
    expect(result.details.html).toBe('<html><body>Login</body></html>');
    expect(result.details.savedTo).toContain('login.html');
  });

  it('uses defaultModel and defaultProjectId from config when not provided', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue({ html: '<p/>', screenId: 'scr-1' });

    const { api, getTool } = makeApi({ defaultProjectId: 'proj-override', defaultModel: 'GEMINI_2_PRO' });
    plugin.register(api as never);

    await getTool('design_generate')!('call-2', {
      screenName: 'home',
      description: 'Home screen',
    });

    expect(callStitchMcp).toHaveBeenCalledWith(
      expect.anything(),
      'generate_screen_from_text',
      expect.objectContaining({ projectId: 'proj-override', modelId: 'GEMINI_2_PRO' }),
    );
  });

  it('returns content with JSON text', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue({ html: '<div/>', screenId: 's1' });

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design_generate')!('call-3', {
      screenName: 'dashboard',
      description: 'Dashboard',
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text) as { screenId: string };
    expect(parsed.screenId).toBe('s1');
  });

  it('propagates errors from callStitchMcp', async () => {
    vi.mocked(callStitchMcp).mockRejectedValue(new Error('Stitch MCP returned 503: Service Unavailable'));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await expect(
      getTool('design_generate')!('call-4', { screenName: 'err', description: 'Test' }),
    ).rejects.toThrow('Stitch MCP returned 503');
  });
});
