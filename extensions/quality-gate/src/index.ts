/**
 * OpenClaw Quality Gate Extension
 *
 * Provides quality gate tools: test runner, coverage report, lint,
 * cyclomatic complexity analysis, and gate enforcement.
 *
 * Compatible with OpenClawPluginApi from 'openclaw/plugin-sdk'.
 */

import { getAllToolDefs } from './tools/index.js';

export default {
  id: 'quality-gate',
  name: 'Quality Gate',
  description:
    'Quality gate engine: test runner, coverage, lint, complexity analysis, and gate enforcement',

  register(api: { registerTool: (tool: unknown, opts?: Record<string, unknown>) => void }) {
    const tools = getAllToolDefs();
    for (const tool of tools) {
      // OpenAI-compatible providers reject dots in tool names.
      (tool as { name: string }).name = (tool as { name: string }).name.replace(/\./g, '_');
      api.registerTool(tool);
    }
  },
};
