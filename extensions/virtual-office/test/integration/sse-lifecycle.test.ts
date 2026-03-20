/**
 * Integration test: SSE lifecycle.
 *
 * Verifies the full flow: AgentStateStore → SSE handler → event stream.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentStateStore } from '../../src/state/agent-state-store.js';
import { createSseHandler } from '../../src/http/sse-handler.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Minimal mock for Node HTTP response. */
function createMockResponse(): ServerResponse & { __written: string[] } {
  const written: string[] = [];
  return {
    __written: written,
    statusCode: 0,
    setHeader: () => {},
    write: (chunk: string) => { written.push(chunk); return true; },
    end: (chunk?: string) => { if (chunk) written.push(chunk); },
    on: () => {},
  } as unknown as ServerResponse & { __written: string[] };
}

/** Minimal mock for Node HTTP request. */
function createMockRequest(method = 'GET'): IncomingMessage & { __closeHandlers: Array<() => void> } {
  const closeHandlers: Array<() => void> = [];
  return {
    method,
    __closeHandlers: closeHandlers,
    on: (event: string, handler: () => void) => {
      if (event === 'close') closeHandlers.push(handler);
    },
  } as unknown as IncomingMessage & { __closeHandlers: Array<() => void> };
}

describe('SSE lifecycle integration', () => {
  let store: AgentStateStore;
  let handler: ReturnType<typeof createSseHandler>;

  beforeEach(() => {
    store = new AgentStateStore();
    handler = createSseHandler(store);
  });

  afterEach(() => {
    store.removeAllListeners();
  });

  it('sends snapshot on connection and incremental updates on state change', () => {
    const req = createMockRequest();
    const res = createMockResponse();

    handler(req, res);

    // Should have received snapshot
    expect(res.__written.length).toBeGreaterThanOrEqual(1);
    const snapshot = res.__written[0];
    expect(snapshot).toContain('event: snapshot');
    expect(snapshot).toContain('"agentId":"pm"');

    // Now update a state
    store.update('pm', { status: 'active', currentTool: 'quality_tests' });

    // Should have received an update event
    const updateEvent = res.__written.find(w => w.includes('event: update'));
    expect(updateEvent).toBeDefined();
    expect(updateEvent).toContain('"status":"active"');
    expect(updateEvent).toContain('"currentTool":"quality_tests"');

    // Cleanup
    for (const h of req.__closeHandlers) h();
  });

  it('cleans up listeners on disconnect', () => {
    const req = createMockRequest();
    const res = createMockResponse();

    handler(req, res);
    expect(store.listenerCount('change')).toBe(1);

    // Simulate disconnect
    for (const h of req.__closeHandlers) h();
    expect(store.listenerCount('change')).toBe(0);
  });

  it('propagates multiple state changes in sequence', () => {
    const req = createMockRequest();
    const res = createMockResponse();

    handler(req, res);

    store.update('qa', { status: 'active', currentTool: 'quality_lint' });
    store.update('devops', { status: 'active', currentTool: 'vcs_pr_create' });
    store.update('qa', { status: 'idle', currentTool: null });

    const updates = res.__written.filter(w => w.includes('event: update'));
    expect(updates.length).toBe(3);
    expect(updates[0]).toContain('"agentId":"qa"');
    expect(updates[1]).toContain('"agentId":"devops"');
    expect(updates[2]).toContain('"currentTool":null');

    for (const h of req.__closeHandlers) h();
  });
});
