import { describe, it, expect, vi } from 'vitest';
import { register } from '../src/index.js';
import type { OpenClawPluginApi } from '../src/index.js';

function createMockApi(): OpenClawPluginApi {
  return {
    id: 'product-team',
    name: 'Product Team Engine',
    source: 'config',
    config: {} as OpenClawPluginApi['config'],
    pluginConfig: { dbPath: ':memory:' },
    runtime: {} as OpenClawPluginApi['runtime'],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerTool: vi.fn(),
    registerHook: vi.fn(),
    registerHttpHandler: vi.fn(),
    registerHttpRoute: vi.fn(),
    registerChannel: vi.fn(),
    registerGatewayMethod: vi.fn(),
    registerCli: vi.fn(),
    registerService: vi.fn(),
    registerProvider: vi.fn(),
    registerCommand: vi.fn(),
    resolvePath: vi.fn((p: string) => p),
    on: vi.fn(),
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
