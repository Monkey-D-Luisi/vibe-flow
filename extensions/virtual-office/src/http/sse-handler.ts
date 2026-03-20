/**
 * SSE Handler -- Server-Sent Events endpoint for the virtual office.
 *
 * Streams agent state changes to connected browser clients.
 * Endpoint: GET /office/events
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentStateStore, StateChangeEvent } from '../state/agent-state-store.js';

const MAX_CLIENTS = 10;
const KEEPALIVE_MS = 30_000;

interface SseClient {
  readonly res: ServerResponse;
  readonly listener: (event: StateChangeEvent) => void;
  readonly keepaliveTimer: ReturnType<typeof setInterval>;
}

/** Send an SSE event to a response stream. */
function sendEvent(res: ServerResponse, eventName: string, data: unknown): void {
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Create an SSE handler for the given agent state store.
 * Returns an HTTP handler for GET /office/events.
 */
export function createSseHandler(
  store: AgentStateStore,
): (req: IncomingMessage, res: ServerResponse) => void {
  const clients = new Set<SseClient>();

  return (req, res) => {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Method Not Allowed');
      return;
    }

    // Enforce max clients
    if (clients.size >= MAX_CLIENTS) {
      res.statusCode = 503;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Too Many Clients');
      return;
    }

    // SSE headers
    res.statusCode = 200;
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('connection', 'keep-alive');

    // Send initial snapshot
    sendEvent(res, 'snapshot', store.getAll());

    // Subscribe to state changes
    const listener = (event: StateChangeEvent): void => {
      sendEvent(res, 'update', event);
    };
    store.on('change', listener);

    // Keepalive ping
    const keepaliveTimer = setInterval(() => {
      sendEvent(res, 'ping', {});
    }, KEEPALIVE_MS);
    keepaliveTimer.unref?.();

    const client: SseClient = { res, listener, keepaliveTimer };
    clients.add(client);

    // Cleanup on disconnect
    req.on('close', () => {
      store.removeListener('change', listener);
      clearInterval(keepaliveTimer);
      clients.delete(client);
    });
  };
}
