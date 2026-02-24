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
  // EP02: task_create, task_get, task_search, task_update, task_transition
  // EP03: workflow_step_run, workflow_state_get
  // EP04: vcs_branch_create, vcs_pr_create, vcs_pr_update, vcs_label_sync
  // EP05: quality_coverage, quality_lint, quality_complexity
}

export default {
  id: 'product-team',
  name: 'Product Team Engine',
  description: 'Task engine + workflow tools for a multi-agent product team',
  register,
};
