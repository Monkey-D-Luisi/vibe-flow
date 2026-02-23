/**
 * OpenClaw Quality Gate Extension
 *
 * Provides quality gate tools: test runner, coverage report, lint,
 * cyclomatic complexity analysis, and gate enforcement.
 */

import { getAllToolDefs } from './src/tools/index.js';

export default {
  id: 'quality-gate',
  name: 'Quality Gate',
  description:
    'Quality gate engine: test runner, coverage, lint, complexity analysis, and gate enforcement',

  register(api: {
    registerTool: (tool: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
    }) => void;
  }) {
    const tools = getAllToolDefs();
    for (const tool of tools) {
      api.registerTool(tool);
    }
  },
};
