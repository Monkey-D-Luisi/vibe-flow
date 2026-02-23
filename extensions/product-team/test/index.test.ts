import { describe, it, expect, vi } from 'vitest';
import { register } from '../src/index.js';
import type { PluginAPI } from '../src/index.js';

function createMockApi(): PluginAPI {
  return {
    id: 'product-team',
    config: {},
    pluginConfig: { dbPath: ':memory:' },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerTool: vi.fn(),
    on: vi.fn(),
    registerService: vi.fn(),
  };
}

describe('product-team plugin', () => {
  it('exports a register function', () => {
    expect(typeof register).toBe('function');
  });

  it('register runs without error with a mock API', () => {
    const api = createMockApi();
    expect(() => register(api)).not.toThrow();
  });

  it('logs a message on load', () => {
    const api = createMockApi();
    register(api);
    expect(api.logger.info).toHaveBeenCalledWith('product-team plugin loaded');
  });
});
