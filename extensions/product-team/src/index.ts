/**
 * OpenClaw Plugin: Product Team Engine
 *
 * Registers task lifecycle, workflow, quality gate, and VCS tools
 * for orchestrating a multi-agent product development team.
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

export type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

export function register(api: OpenClawPluginApi): void {
  api.logger.info('product-team plugin loaded');
  // EP02: task.create, task.get, task.search, task.update, task.transition
  // EP03: workflow.step.run, workflow.state.get
  // EP04: vcs.branch.create, vcs.pr.create, vcs.pr.update, vcs.label.sync
  // EP05: quality.coverage, quality.lint, quality.complexity
}

export default {
  id: 'product-team',
  name: 'Product Team Engine',
  description: 'Task engine + workflow tools for a multi-agent product team',
  register,
};
