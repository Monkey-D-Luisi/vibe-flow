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
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
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
    logger,
  };
  return { api, logger, getTool: (name: string) => tools.get(name) };
}

describe('design.list tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty designs when directory does not exist (ENOENT)', async () => {
    const enoent = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    vi.mocked(fsMock.readdir).mockRejectedValue(enoent);

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design.list')!('call-1', {}) as { details: { designs: unknown[] } };

    expect(result.details.designs).toEqual([]);
  });

  it('lists html files with name, path, and modifiedAt', async () => {
    vi.mocked(fsMock.readdir).mockResolvedValue(['login.html', 'dashboard.html', 'notes.txt'] as never);
    vi.mocked(fsMock.stat).mockResolvedValue({ mtime: new Date('2026-03-01T00:00:00Z') } as never);

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design.list')!('call-2', {
      workspace: '/workspace/proj',
    }) as { details: { designs: Array<{ name: string; path: string; modifiedAt: string }> } };

    expect(result.details.designs).toHaveLength(2);
    expect(result.details.designs[0].name).toBe('login');
    expect(result.details.designs[1].name).toBe('dashboard');
    expect(result.details.designs[0].modifiedAt).toBe('2026-03-01T00:00:00.000Z');
    // notes.txt filtered out
  });

  it('rethrows non-ENOENT errors and logs a warning', async () => {
    const permError = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    vi.mocked(fsMock.readdir).mockRejectedValue(permError);

    const { api, logger, getTool } = makeApi();
    plugin.register(api as never);

    await expect(getTool('design.list')!('call-3', {})).rejects.toThrow('EACCES');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('design.list readdir failed'));
  });

  it('filters out non-html files', async () => {
    vi.mocked(fsMock.readdir).mockResolvedValue(['.gitkeep', 'README.md', 'home.html'] as never);
    vi.mocked(fsMock.stat).mockResolvedValue({ mtime: new Date('2026-03-01T00:00:00Z') } as never);

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design.list')!('call-4', {}) as { details: { designs: unknown[] } };

    expect(result.details.designs).toHaveLength(1);
    expect((result.details.designs[0] as { name: string }).name).toBe('home');
  });
});
