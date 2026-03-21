/**
 * Virtual Office Extension
 *
 * Serves a pixel-art virtual office at /office that visualizes the 8 AI agents
 * in real-time based on pipeline stage and tool activity.
 *
 * Routes:
 *   GET /office/events -- SSE stream of agent state changes
 *   GET /office/*      -- Static files (HTML, JS, CSS)
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticHandler } from './http/static-server.js';
import { createSseHandler } from './http/sse-handler.js';
import { AgentStateStore } from './state/agent-state-store.js';
import { createEventHandlers } from './state/event-mapper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  id: 'virtual-office',
  name: 'Virtual Office',
  description: 'Pixel-art virtual office that visualizes AI agent activity in real-time at /office',

  register(api: OpenClawPluginApi) {
    const logger = api.logger;
    const slog = (level: 'info' | 'warn' | 'error', op: string, ctx?: Record<string, unknown>) =>
      logger[level](JSON.stringify({ ts: new Date().toISOString(), ext: 'virtual-office', op, ...ctx }));

    // --- State store ---
    const store = new AgentStateStore();

    // --- Lifecycle hooks ---
    const handlers = createEventHandlers(store);

    api.on('before_tool_call', (event, ctx) => {
      handlers.onBeforeToolCall(
        event as { toolName: string; params?: Record<string, unknown> },
        ctx as { agentId?: string },
      );
    });

    api.on('after_tool_call', (event, ctx) => {
      handlers.onAfterToolCall(
        event as { toolName: string; result?: unknown; params?: Record<string, unknown> },
        ctx as { agentId?: string },
      );
    });

    api.on('agent_end', (event, ctx) => {
      handlers.onAgentEnd(event, ctx as { agentId?: string });
    });

    api.on('subagent_spawned', (event) => {
      handlers.onSubagentSpawned(event as { agentId?: string });
    });

    slog('info', 'hooks.registered');

    // --- HTTP handlers ---
    const publicDir = resolve(__dirname, '..', 'dist', 'public');
    const staticHandler = createStaticHandler({
      baseDir: publicDir,
      urlPrefix: '/office',
    });
    const sseHandler = createSseHandler(store);

    // Composed handler: route /office/events to SSE, everything else to static
    const composedHandler = async (
      req: import('node:http').IncomingMessage,
      res: import('node:http').ServerResponse,
    ): Promise<void> => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      if (url.pathname === '/office/events') {
        sseHandler(req, res);
        return;
      }

      return staticHandler(req, res);
    };

    api.registerHttpRoute({
      path: '/office',
      auth: 'plugin',
      match: 'prefix',
      handler: composedHandler,
    });

    slog('info', 'routes.registered');
  },
};
