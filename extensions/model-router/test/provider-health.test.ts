import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerProviderHealthRoute } from '../src/provider-health.js';
import type { checkProvider } from '../src/provider-health.js';

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
type CheckFn = typeof checkProvider;

function makeApi() {
  let registeredPath = '';
  let registeredHandler: RouteHandler | null = null;
  const api = {
    registerHttpRoute: vi.fn(({ path, handler }: { path: string; auth: string; handler: RouteHandler }) => {
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
    end: vi.fn((body?: string) => {
      if (body !== undefined) chunks.push(body);
    }),
    getBody: () => JSON.parse(chunks[0] ?? '{}') as unknown,
    hasBody: () => chunks.length > 0,
  };
  return res;
}

function makeReq(method = 'GET', headers: Record<string, string> = {}) {
  return { method, headers } as unknown as IncomingMessage;
}

function makeAllConnectedCheck(): CheckFn {
  return vi.fn().mockResolvedValue({ connected: true, latencyMs: 50 });
}

function makePartialCheck(): CheckFn {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    call++;
    if (call === 1) return Promise.resolve({ connected: true, latencyMs: 40 });
    return Promise.resolve({ connected: false, latencyMs: 5001, error: 'timeout' });
  });
}

function makeThrowingCheck(): CheckFn {
  return vi.fn().mockRejectedValue(new Error('network failure'));
}

describe('registerProviderHealthRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env['HEALTH_CHECK_SECRET'];
  });

  afterEach(() => {
    delete process.env['HEALTH_CHECK_SECRET'];
  });

  it('registers the route at /api/providers/health', () => {
    const { api, getPath } = makeApi();
    registerProviderHealthRoute(api as never);
    expect(getPath()).toBe('/api/providers/health');
  });

  it('returns 405 for non-GET/HEAD methods', async () => {
    const { api, getHandler } = makeApi();
    registerProviderHealthRoute(api as never, makeAllConnectedCheck());
    const handler = getHandler()!;
    const res = makeRes();
    await handler(makeReq('POST'), res as never);
    expect(res.statusCode).toBe(405);
    expect(res.getBody()).toMatchObject({ ok: false, error: 'method_not_allowed' });
  });

  it('returns 200 with all providers connected', async () => {
    const { api, getHandler } = makeApi();
    registerProviderHealthRoute(api as never, makeAllConnectedCheck());
    const handler = getHandler()!;
    const res = makeRes();
    await handler(makeReq('GET'), res as never);
    expect(res.statusCode).toBe(200);
    const body = res.getBody() as { ok: boolean; providers: Record<string, { connected: boolean }> };
    expect(body.ok).toBe(true);
    expect(Object.values(body.providers).every(p => p.connected)).toBe(true);
  });

  it('returns 207 when at least one provider is not connected', async () => {
    const { api, getHandler } = makeApi();
    registerProviderHealthRoute(api as never, makePartialCheck());
    const handler = getHandler()!;
    const res = makeRes();
    await handler(makeReq('GET'), res as never);
    expect(res.statusCode).toBe(207);
    const body = res.getBody() as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it('returns 500 when checkFn throws', async () => {
    const { api, getHandler } = makeApi();
    registerProviderHealthRoute(api as never, makeThrowingCheck());
    const handler = getHandler()!;
    const res = makeRes();
    await handler(makeReq('GET'), res as never);
    expect(res.statusCode).toBe(500);
    expect(res.getBody()).toMatchObject({ ok: false });
  });

  it('returns headers but no body for HEAD requests', async () => {
    const { api, getHandler } = makeApi();
    registerProviderHealthRoute(api as never, makeAllConnectedCheck());
    const handler = getHandler()!;
    const res = makeRes();
    await handler(makeReq('HEAD'), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.hasBody()).toBe(false);
  });

  it('returns 401 when HEALTH_CHECK_SECRET is set and no token provided', async () => {
    process.env['HEALTH_CHECK_SECRET'] = 'supersecret';
    const { api, getHandler } = makeApi();
    registerProviderHealthRoute(api as never, makeAllConnectedCheck());
    const handler = getHandler()!;
    const res = makeRes();
    await handler(makeReq('GET'), res as never);
    expect(res.statusCode).toBe(401);
    expect(res.getBody()).toMatchObject({ ok: false, error: 'unauthorized' });
  });

  it('returns 200 when HEALTH_CHECK_SECRET is set and correct token provided', async () => {
    process.env['HEALTH_CHECK_SECRET'] = 'supersecret';
    const { api, getHandler } = makeApi();
    registerProviderHealthRoute(api as never, makeAllConnectedCheck());
    const handler = getHandler()!;
    const res = makeRes();
    await handler(makeReq('GET', { authorization: 'Bearer supersecret' }), res as never);
    expect(res.statusCode).toBe(200);
    expect((res.getBody() as { ok: boolean }).ok).toBe(true);
  });
});
