/**
 * Tool Action Map -- Maps tool names to FSM animation states.
 *
 * Pure logic, no DOM dependency. Used by the state-mapper to determine
 * what animation an agent should play based on the tool being used.
 */

import type { FsmState } from './fsm-types.js';

/**
 * Map of tool name patterns to FSM states.
 *
 * Checked in order -- first match wins. Uses startsWith for prefix
 * matching to handle tool families (e.g. quality_tests, quality_lint).
 */
const TOOL_PATTERNS: Array<{ prefix: string; state: FsmState }> = [
  // Quality tools → typing (running tests / linting)
  { prefix: 'quality_tests',      state: 'typing' },
  { prefix: 'quality_coverage',   state: 'typing' },
  { prefix: 'quality_lint',       state: 'typing' },
  { prefix: 'quality_complexity', state: 'typing' },
  { prefix: 'quality_gate',       state: 'typing' },
  { prefix: 'qgate_',             state: 'typing' },

  // Task/workflow tools → reading (reviewing / searching)
  { prefix: 'task_search',        state: 'reading' },
  { prefix: 'task_get',           state: 'reading' },
  { prefix: 'task_create',        state: 'typing' },
  { prefix: 'task_update',        state: 'typing' },
  { prefix: 'task_transition',    state: 'typing' },
  { prefix: 'workflow_',          state: 'reading' },

  // Decision engine → reading
  { prefix: 'decision_',          state: 'reading' },

  // Communication → meeting
  { prefix: 'team_message',       state: 'meeting' },
  { prefix: 'team_reply',         state: 'meeting' },
  { prefix: 'team_inbox',         state: 'reading' },
  { prefix: 'team_status',        state: 'meeting' },
  { prefix: 'team_assign',        state: 'meeting' },

  // VCS tools → typing (writing code / creating PRs)
  { prefix: 'vcs_',               state: 'typing' },

  // Pipeline tools → walking (transitioning between stages)
  { prefix: 'pipeline_advance',   state: 'walking' },
  { prefix: 'pipeline_',          state: 'reading' },

  // Project tools → reading
  { prefix: 'project_',           state: 'reading' },
];

/**
 * Get the FSM state an agent should display while using a specific tool.
 * Returns 'typing' as default for unknown tools (agents are usually coding).
 */
export function getToolAction(toolName: string | null): FsmState {
  if (!toolName) return 'idle';

  for (const pattern of TOOL_PATTERNS) {
    if (toolName.startsWith(pattern.prefix)) {
      return pattern.state;
    }
  }

  // Default: unknown tools are likely coding activities
  return 'typing';
}
