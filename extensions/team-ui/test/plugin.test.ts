import { describe, it, expect, vi, beforeEach } from 'vitest';
import plugin from '../src/index.js';

interface MockApi {
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  pluginConfig: Record<string, unknown>;
  registeredMethods: Map<string, unknown>;
  registeredRoutes: Array<{ path: string; handler: unknown }>;
  registerGatewayMethod: ReturnType<typeof vi.fn>;
  registerHttpRoute: ReturnType<typeof vi.fn>;
}

function createMockApi(config: Record<string, unknown> = {}): MockApi {
  const api: MockApi = {
    logger: { info: vi.fn(), warn: vi.fn() },
    pluginConfig: config,
    registeredMethods: new Map(),
    registeredRoutes: [],
    registerGatewayMethod: vi.fn((name: string, handler: unknown) => {
      api.registeredMethods.set(name, handler);
    }),
    registerHttpRoute: vi.fn((route: { path: string; handler: unknown }) => {
      api.registeredRoutes.push(route);
    }),
  };
  return api;
}

describe('team-ui plugin', () => {
  it('has correct metadata', () => {
    expect(plugin.id).toBe('team-ui');
    expect(plugin.name).toBe('Team Configuration UI');
  });

  describe('register', () => {
    let api: MockApi;

    beforeEach(() => {
      api = createMockApi();
      plugin.register(api as never);
    });

    it('registers all 12 gateway WebSocket methods', () => {
      const expectedMethods = [
        'team.config.get',
        'team.config.update',
        'team.agents.list',
        'team.agents.update',
        'team.projects.list',
        'team.projects.add',
        'team.projects.remove',
        'team.providers.status',
        'team.pipeline.status',
        'team.costs.summary',
        'team.events.stream',
        'team.decisions.list',
      ];

      expect(api.registerGatewayMethod).toHaveBeenCalledTimes(12);
      for (const method of expectedMethods) {
        expect(api.registeredMethods.has(method)).toBe(true);
      }
    });

    it('registers the /team HTTP route', () => {
      expect(api.registerHttpRoute).toHaveBeenCalledTimes(1);
      expect(api.registeredRoutes[0].path).toBe('/team');
    });

    it('logs registration message', () => {
      expect(api.logger.info).toHaveBeenCalledWith(
        'team-ui: registered 12 gateway methods; dashboard at /team',
      );
    });
  });

  describe('config handling', () => {
    it('uses /team as default basePath when pluginConfig is null', () => {
      const api = createMockApi();
      api.pluginConfig = null as never;
      plugin.register(api as never);

      expect(api.registeredRoutes[0].path).toBe('/team');
    });

    it('uses /team as default basePath when basePath is not a string', () => {
      const api = createMockApi({ basePath: 42 });
      plugin.register(api as never);

      expect(api.registeredRoutes[0].path).toBe('/team');
    });

    it('accepts valid string basePath', () => {
      const api = createMockApi({ basePath: '/dashboard' });
      plugin.register(api as never);

      expect(api.registeredRoutes[0].path).toBe('/dashboard');
      expect(api.logger.warn).toHaveBeenCalled();
    });
  });

  describe('HTTP handler', () => {
    it('returns 405 for non-GET/HEAD methods', () => {
      const api = createMockApi();
      plugin.register(api as never);

      const handler = api.registeredRoutes[0].handler as (
        req: { method: string },
        res: { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
      ) => void;

      const res = { writeHead: vi.fn(), end: vi.fn() };
      handler({ method: 'POST' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(405, { Allow: 'GET, HEAD' });
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 200 with HTML for GET', () => {
      const api = createMockApi();
      plugin.register(api as never);

      const handler = api.registeredRoutes[0].handler as (
        req: { method: string },
        res: { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
      ) => void;

      const res = { writeHead: vi.fn(), end: vi.fn() };
      handler({ method: 'GET' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/html; charset=utf-8',
      });
      expect(res.end).toHaveBeenCalledWith(expect.stringContaining('<!DOCTYPE html>'));
    });
  });
});
