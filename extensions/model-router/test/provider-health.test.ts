import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerProviderHealthRoute } from '../src/provider-health.js';

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function makeApi() {
  let registeredPath = '';
  let registeredHandler: RouteHandler | null = null;
  const api = {
    registerHttpRoute: vi.fn(({ path, handler }: { path: string; handler: RouteHandler }) => {
      registeredPath = path;
      registeredHandler = handler;
    }),
    logger: { info: vi.fn() },
  };
  return { api, getPath: () => registeredPath, getHandler: () => registeredHandler };
}

function makeRes() {
  const chunks: string[] = [];
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name] = value;
    }),
    end: vi.fn((body: string) => {
      chunks.push(body);
    }),
    getBody: () => JSON.parse(chunks[0] ?? '{}') as unknown,
  };
  return res;
}

function makeReq(method = 'GET') {
  return { method } as unknown as IncomingMessage;
}

describe('registerProviderHealthRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('registers the route at /api/providers/health', () => {
    const { api, getPath } = makeApi();
    registerProviderHealthRoute(api as never);
    expect(getPath()).toBe('/api/providers/health');
  });

  it('returns 405 for non-GET/HEAD methods', async () => {
    const { api, getHandler } = makeApi();
    registerProviderHealthRoute(api as never);
    const handler = getHandler()!;
    const res = makeRes();
    await handler(makeReq('POST'), res as never);
    expect(res.statusCode).toBe(405);
    expect(res.getBody()).toMatchObject({ ok: false, error: 'method_not_allowed' });
  });
});
