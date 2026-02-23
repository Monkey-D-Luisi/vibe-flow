/**
 * OpenClaw Quality Gate Extension
 *
 * Provides quality gate tools: test runner, coverage report, lint,
 * cyclomatic complexity analysis, and gate enforcement.
 *
 * Compatible with OpenClawPluginApi from 'openclaw/plugin-sdk'.
 */

import { getAllToolDefs } from './src/tools/index.js';

export default {
  id: 'quality-gate',
  name: 'Quality Gate',
  description:
    'Quality gate engine: test runner, coverage, lint, complexity analysis, and gate enforcement',

  register(api: { registerTool: (tool: unknown, opts?: Record<string, unknown>) => void }) {
    const tools = getAllToolDefs();
    for (const tool of tools) {
      api.registerTool(tool);
    }
  },
};
