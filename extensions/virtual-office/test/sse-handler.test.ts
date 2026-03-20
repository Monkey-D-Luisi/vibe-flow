import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSseHandler } from '../src/http/sse-handler.js';
import { AgentStateStore } from '../src/state/agent-state-store.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

/** Minimal mock for IncomingMessage with event emitter for 'close'. */
function mockReq(method = 'GET'): IncomingMessage {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    url: '/office/events',
    method,
    headers: { host: 'localhost:28789' },
  }) as unknown as IncomingMessage;
}

/** Minimal mock for ServerResponse that captures output. */
function mockRes(): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
  _ended: boolean;
} {
  const headers: Record<string, string> = {};
  let body = '';
  let statusCode = 200;
  let ended = false;

  return {
    get _statusCode() { return statusCode; },
    get _headers() { return headers; },
    get _body() { return body; },
    get _ended() { return ended; },
    set statusCode(code: number) { statusCode = code; },
    get statusCode() { return statusCode; },
    setHeader(name: string, value: string) { headers[name] = value; },
    write(data: string) { body += data; return true; },
    end(data?: string) {
      if (data) body += data;
      ended = true;
    },
  } as unknown as ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: string;
    _ended: boolean;
  };
}

describe('SSE Handler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns text/event-stream content type', () => {
    const store = new AgentStateStore(['pm']);
    const handler = createSseHandler(store);
    const req = mockReq();
    const res = mockRes();

    handler(req, res);

    expect(res._headers['content-type']).toBe('text/event-stream');
    expect(res._headers['cache-control']).toBe('no-cache');
  });

  it('sends snapshot event on connection', () => {
    const store = new AgentStateStore(['pm', 'qa']);
    const handler = createSseHandler(store);
    const req = mockReq();
    const res = mockRes();

    handler(req, res);

    expect(res._body).toContain('event: snapshot');
    const dataLine = res._body.split('\n').find(l => l.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const data = JSON.parse(dataLine!.replace('data: ', ''));
    expect(data).toHaveLength(2);
    expect(data[0].agentId).toBe('pm');
  });

  it('sends update events when store changes', () => {
    const store = new AgentStateStore(['pm']);
    const handler = createSseHandler(store);
    const req = mockReq();
    const res = mockRes();

    handler(req, res);

    // Clear initial snapshot from body
    const bodyAfterSnapshot = res._body;

    store.update('pm', { status: 'active', currentTool: 'quality_tests' });

    // Body should now contain the update event
    const newBody = res._body.slice(bodyAfterSnapshot.length);
    expect(newBody).toContain('event: update');
    expect(newBody).toContain('"active"');
  });

  it('cleans up listener on client disconnect', () => {
    const store = new AgentStateStore(['pm']);
    const handler = createSseHandler(store);
    const req = mockReq();
    const res = mockRes();

    handler(req, res);

    expect(store.listenerCount('change')).toBe(1);

    // Simulate disconnect
    (req as unknown as EventEmitter).emit('close');

    expect(store.listenerCount('change')).toBe(0);
  });

  it('returns 405 for non-GET requests', () => {
    const store = new AgentStateStore(['pm']);
    const handler = createSseHandler(store);
    const req = mockReq('POST');
    const res = mockRes();

    handler(req, res);

    expect(res._statusCode).toBe(405);
    expect(res._ended).toBe(true);
  });
});
