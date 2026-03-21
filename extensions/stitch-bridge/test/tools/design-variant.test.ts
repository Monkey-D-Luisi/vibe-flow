import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/stitch-client.js', () => ({
  callStitchMcp: vi.fn(),
  listTools: vi.fn().mockResolvedValue({ tools: [] }),
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
      defaultModel: 'GEMINI_3_1_PRO',
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

function makeVariantResponse(count: number): Record<string, unknown> {
  const screens = Array.from({ length: count }, (_, i) => ({
    name: `variant-screen-${i}`,
    htmlCode: { downloadUrl: `https://stitch.googleapis.com/html/${i}` },
  }));
  return {
    outputComponents: [{ design: { screens } }],
  };
}

describe('design_variant tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fsMock.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsMock.writeFile).mockResolvedValue(undefined);

    // Mock global fetch for variant HTML downloads (URL must match config endpoint origin)
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      const idx = url.split('/').pop();
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(`<html>Variant ${idx}</html>`),
      });
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls generate_variants with correct parameters', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue(makeVariantResponse(3));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await getTool('design_variant')!('call-1', {
      screenIds: ['scr-1', 'scr-2'],
      prompt: 'Make it more colorful',
      screenName: 'dashboard',
      variantCount: 3,
      creativeRange: 'EXPLORE',
      workspace: '/workspace/myproject',
    });

    expect(callStitchMcp).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://stitch.googleapis.com/mcp' }),
      'generate_variants',
      expect.objectContaining({
        selectedScreenIds: ['scr-1', 'scr-2'],
        prompt: 'Make it more colorful',
        variantOptions: expect.objectContaining({ variantCount: 3, creativeRange: 'EXPLORE' }),
      }),
    );
  });

  it('saves multiple variant HTML files with correct naming', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue(makeVariantResponse(3));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design_variant')!('call-2', {
      screenIds: ['scr-1'],
      prompt: 'Try different layouts',
      screenName: 'login',
      workspace: '/workspace/myproject',
    }) as { details: { variants: { index: number; savedTo: string }[]; count: number } };

    expect(result.details.count).toBe(3);
    expect(result.details.variants).toHaveLength(3);
    expect(result.details.variants[0].savedTo).toContain('login-variant-1.html');
    expect(result.details.variants[1].savedTo).toContain('login-variant-2.html');
    expect(result.details.variants[2].savedTo).toContain('login-variant-3.html');
    expect(fsMock.writeFile).toHaveBeenCalledTimes(3);
  });

  it('uses default variantCount=3 and creativeRange=EXPLORE', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue(makeVariantResponse(3));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await getTool('design_variant')!('call-3', {
      screenIds: ['scr-1'],
      prompt: 'test',
      workspace: '/workspace/myproject',
    });

    expect(callStitchMcp).toHaveBeenCalledWith(
      expect.anything(),
      'generate_variants',
      expect.objectContaining({
        variantOptions: expect.objectContaining({ variantCount: 3, creativeRange: 'EXPLORE' }),
      }),
    );
  });

  it('passes aspects when provided', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue(makeVariantResponse(1));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await getTool('design_variant')!('call-4', {
      screenIds: ['scr-1'],
      prompt: 'Change colors',
      aspects: ['COLOR_SCHEME', 'LAYOUT'],
      workspace: '/workspace/myproject',
    });

    expect(callStitchMcp).toHaveBeenCalledWith(
      expect.anything(),
      'generate_variants',
      expect.objectContaining({
        variantOptions: expect.objectContaining({
          aspects: ['COLOR_SCHEME', 'LAYOUT'],
        }),
      }),
    );
  });

  it('sanitizes screenName for path traversal', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue(makeVariantResponse(1));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design_variant')!('call-5', {
      screenIds: ['scr-1'],
      prompt: 'test',
      screenName: '../../../etc/evil',
      workspace: '/workspace/myproject',
    }) as { details: { variants: { savedTo: string }[] } };

    expect(result.details.variants[0].savedTo).toContain('evil-variant-1.html');
    expect(result.details.variants[0].savedTo).not.toContain('..');
  });

  it('propagates errors from callStitchMcp', async () => {
    vi.mocked(callStitchMcp).mockRejectedValue(new Error('Stitch MCP returned 503'));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await expect(
      getTool('design_variant')!('call-6', {
        screenIds: ['scr-1'],
        prompt: 'test',
        workspace: '/workspace/myproject',
      }),
    ).rejects.toThrow('Stitch MCP returned 503');
  });

  it('rejects non-array screenIds', async () => {
    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await expect(
      getTool('design_variant')!('call-7', {
        screenIds: 'invalid',
        prompt: 'test',
        workspace: '/workspace/myproject',
      }),
    ).rejects.toThrow('screenIds must be a non-empty array of strings');
  });

  it('rejects empty screenIds array', async () => {
    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await expect(
      getTool('design_variant')!('call-8', {
        screenIds: [],
        prompt: 'test',
        workspace: '/workspace/myproject',
      }),
    ).rejects.toThrow('screenIds must be a non-empty array of strings');
  });

  it('clamps variantCount to 1-5 range', async () => {
    vi.mocked(callStitchMcp).mockResolvedValue(makeVariantResponse(1));

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await getTool('design_variant')!('call-9', {
      screenIds: ['scr-1'],
      prompt: 'test',
      variantCount: 99,
      workspace: '/workspace/myproject',
    });

    expect(callStitchMcp).toHaveBeenCalledWith(
      expect.anything(),
      'generate_variants',
      expect.objectContaining({
        variantOptions: expect.objectContaining({ variantCount: 5 }),
      }),
    );
  });

  it('rejects invalid creativeRange', async () => {
    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await expect(
      getTool('design_variant')!('call-10', {
        screenIds: ['scr-1'],
        prompt: 'test',
        creativeRange: 'INVALID',
        workspace: '/workspace/myproject',
      }),
    ).rejects.toThrow('Invalid creativeRange');
  });

  it('rejects invalid aspect values', async () => {
    const { api, getTool } = makeApi();
    plugin.register(api as never);

    await expect(
      getTool('design_variant')!('call-11', {
        screenIds: ['scr-1'],
        prompt: 'test',
        aspects: ['LAYOUT', 'INVALID_ASPECT'],
        workspace: '/workspace/myproject',
      }),
    ).rejects.toThrow('Invalid aspect');
  });

  it('reports warnings for failed variant downloads', async () => {
    const response = {
      outputComponents: [{
        design: {
          screens: [
            { name: 'ok', htmlCode: { downloadUrl: 'https://stitch.googleapis.com/html/ok' } },
            { name: 'bad', htmlCode: { downloadUrl: 'https://evil.com/steal' } },
          ],
        },
      }],
    };
    vi.mocked(callStitchMcp).mockResolvedValue(response);

    const { api, getTool } = makeApi();
    plugin.register(api as never);

    const result = await getTool('design_variant')!('call-12', {
      screenIds: ['scr-1'],
      prompt: 'test',
      workspace: '/workspace/myproject',
    }) as { details: { count: number; warnings?: string[] } };

    expect(result.details.count).toBe(1);
    expect(result.details.warnings).toBeDefined();
    expect(result.details.warnings).toHaveLength(1);
    expect(result.details.warnings![0]).toContain('Untrusted download URL');
  });
});
