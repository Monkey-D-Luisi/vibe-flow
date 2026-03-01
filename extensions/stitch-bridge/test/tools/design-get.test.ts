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

import * as fsMock from 'node:fs/promises';
import plugin from '../../src/index.js';

type ToolExecuteFn = (id: string, params: Record<string, unknown>) => Promise<unknown>;

function makeApi() {
  const tools = new Map<string, ToolExecuteFn>();
  const api = {
    pluginConfig: {
      endpoint: 'https://stitch.googleapis.com/mcp',
      defaultProjectId: 'proj-test',
      defaultModel: 'GEMINI_3_PRO',
      timeoutMs: 5000,
      designDir: '.stitch-html',
    },
    registerTool: vi.fn(({ name, execute }: { name: string; execute: ToolExecuteFn }) => {
      tools.set(name, execute);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  return { api, getTool: (name: string) => tools.get(name) };
}

describe('design.get tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads HTML file from workspace using screenName', async () => {
    vi.mocked(fsMock.readFile).mockResolvedValue('<html>Login</html>' as never);

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design.get')!('call-1', {
      screenName: 'login',
      workspace: '/workspace/myproject',
    }) as { details: { html: string; path: string } };

    expect(fsMock.readFile).toHaveBeenCalledWith(
      expect.stringContaining('login.html'),
      'utf-8',
    );
    expect(result.details.html).toBe('<html>Login</html>');
    expect(result.details.path).toContain('login.html');
  });

  it('sanitizes screenName using basename to block path traversal', async () => {
    vi.mocked(fsMock.readFile).mockResolvedValue('<p/>' as never);

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design.get')!('call-2', {
      screenName: '../../../etc/passwd',
    }) as { details: { path: string } };

    // basename strips traversal — path should just use 'passwd'
    expect(result.details.path).toContain('passwd.html');
    expect(result.details.path).not.toContain('..');
  });

  it('propagates errors from readFile', async () => {
    vi.mocked(fsMock.readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await expect(
      getTool('design.get')!('call-3', { screenName: 'missing' }),
    ).rejects.toThrow('ENOENT');
  });
});
