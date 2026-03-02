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

/** Helper to find a registered route by path */
function findRoute(api: MockApi, path: string) {
  return api.registeredRoutes.find((r) => r.path === path);
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

    it('registers 2 HTTP routes (API + dashboard)', () => {
      expect(api.registerHttpRoute).toHaveBeenCalledTimes(2);
      expect(findRoute(api, '/team/api/agents')).toBeDefined();
      expect(findRoute(api, '/team')).toBeDefined();
    });

    it('logs registration message', () => {
      expect(api.logger.info).toHaveBeenCalledWith(
        'team-ui: registered 12 gateway methods, 2 HTTP routes; dashboard at /team',
      );
    });
  });

  describe('config handling', () => {
    it('uses /team as default basePath when pluginConfig is null', () => {
      const api = createMockApi();
      api.pluginConfig = null as never;
      plugin.register(api as never);

      expect(findRoute(api, '/team')).toBeDefined();
      expect(findRoute(api, '/team/api/agents')).toBeDefined();
    });

    it('uses /team as default basePath when basePath is not a string', () => {
      const api = createMockApi({ basePath: 42 });
      plugin.register(api as never);

      expect(findRoute(api, '/team')).toBeDefined();
      expect(findRoute(api, '/team/api/agents')).toBeDefined();
    });

    it('accepts valid string basePath', () => {
      const api = createMockApi({ basePath: '/dashboard' });
      plugin.register(api as never);

      expect(findRoute(api, '/dashboard')).toBeDefined();
      expect(findRoute(api, '/dashboard/api/agents')).toBeDefined();
      expect(api.logger.warn).toHaveBeenCalled();
    });
  });

  describe('dashboard HTTP handler (/team)', () => {
    it('returns 405 for non-GET/HEAD methods', () => {
      const api = createMockApi();
      plugin.register(api as never);

      const route = findRoute(api, '/team')!;
      const handler = route.handler as (
        req: { method: string },
        res: { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
      ) => void;

      const res = { writeHead: vi.fn(), end: vi.fn() };
      handler({ method: 'POST' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(405, { Allow: 'GET, HEAD' });
      expect(res.end).toHaveBeenCalled();
    });

    it('returns 200 with HTML containing __AGENTS__ JSON for GET', () => {
      const api = createMockApi();
      plugin.register(api as never);

      const route = findRoute(api, '/team')!;
      const handler = route.handler as (
        req: { method: string },
        res: { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
      ) => void;

      const res = { writeHead: vi.fn(), end: vi.fn() };
      handler({ method: 'GET' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/html; charset=utf-8',
      });
      const html = res.end.mock.calls[0][0] as string;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('var __AGENTS__ =');
      expect(html).toContain('Product Team Dashboard');
    });
  });

  describe('REST API handler (/team/api/agents)', () => {
    it('returns 405 for non-GET/HEAD methods', () => {
      const api = createMockApi();
      plugin.register(api as never);

      const route = findRoute(api, '/team/api/agents')!;
      const handler = route.handler as (
        req: { method: string },
        res: { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
      ) => void;

      const res = { writeHead: vi.fn(), end: vi.fn() };
      handler({ method: 'POST' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(405, {
        Allow: 'GET, HEAD',
        'Content-Type': 'application/json',
      });
      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'method_not_allowed' }));
    });

    it('returns 200 with JSON agent roster for GET', () => {
      const api = createMockApi();
      plugin.register(api as never);

      const route = findRoute(api, '/team/api/agents')!;
      const handler = route.handler as (
        req: { method: string },
        res: { writeHead: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
      ) => void;

      const res = { writeHead: vi.fn(), end: vi.fn() };
      handler({ method: 'GET' }, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      });

      const body = JSON.parse(res.end.mock.calls[0][0] as string);
      expect(body.ok).toBe(true);
      expect(body.agents).toBeInstanceOf(Array);
      expect(body.agents.length).toBeGreaterThan(0);
      expect(body.agents[0]).toHaveProperty('id');
      expect(body.agents[0]).toHaveProperty('name');
      expect(body.agents[0]).toHaveProperty('model');
      expect(body.agents[0]).toHaveProperty('status');
    });
  });
});
