/**
 * Virtual Office Extension
 *
 * Serves a pixel-art virtual office at /office that visualizes the 8 AI agents
 * in real-time based on pipeline stage and tool activity.
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticHandler } from './http/static-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  id: 'virtual-office',
  name: 'Virtual Office',
  description: 'Pixel-art virtual office that visualizes AI agent activity in real-time at /office',

  register(api: OpenClawPluginApi) {
    const logger = api.logger;

    // Serve the virtual office frontend at /office/*
    const publicDir = resolve(__dirname, '..', 'dist', 'public');
    const staticHandler = createStaticHandler({
      baseDir: publicDir,
      urlPrefix: '/office',
    });

    api.registerHttpRoute({
      path: '/office',
      auth: 'plugin',
      match: 'prefix',
      handler: staticHandler,
    });

    logger.info('virtual-office: registered GET /office/* static file server');

    // TODO (task 0131): Register lifecycle hooks for agent activity tracking
    // api.on('before_tool_call', ...);
    // api.on('after_tool_call', ...);
    // api.on('agent_end', ...);
    // api.on('subagent_spawned', ...);

    // TODO (task 0131): Register gateway WebSocket methods
    // api.registerGatewayMethod('office.state', ...);
  },
};
