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

describe('design_edit tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fsMock.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsMock.writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls edit_screens and saves HTML to workspace', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue({ html: '<html><body>Edited</body></html>' });

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design_edit')!('call-1', {
      screenId: 'scr-xyz',
      screenName: 'login',
      editPrompt: 'Add a forgot password link',
      workspace: '/workspace/myproject',
    }) as { details: { html: string; savedTo: string } };

    expect(callStitchMcp).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://stitch.googleapis.com/mcp' }),
      'edit_screens',
      expect.objectContaining({ screenId: 'scr-xyz', prompt: 'Add a forgot password link' }),
    );
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('login.html'),
      '<html><body>Edited</body></html>',
      'utf-8',
    );
    expect(result.details.html).toBe('<html><body>Edited</body></html>');
    expect(result.details.savedTo).toContain('login.html');
  });

  it('sanitizes screenName using basename to block path traversal', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue({ html: '<p/>' });
    vi.mocked(fsMock.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsMock.writeFile).mockResolvedValue(undefined);

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design_edit')!('call-2', {
      screenId: 'scr-abc',
      screenName: '../../../etc/evil',
      editPrompt: 'test',
    }) as { details: { savedTo: string } };

    // basename strips traversal — resulting file name should be just 'evil'
    expect(result.details.savedTo).toContain('evil.html');
    expect(result.details.savedTo).not.toContain('..');
  });

  it('propagates errors from callStitchMcp', async () => {
    vi.mocked(callStitchMcp).mockRejectedValue(new Error('Stitch MCP returned 503'));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await expect(
      getTool('design_edit')!('call-3', { screenId: 'scr-1', editPrompt: 'test', screenName: 'login' }),
    ).rejects.toThrow('Stitch MCP returned 503');
  });
});
