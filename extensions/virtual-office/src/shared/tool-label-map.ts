/**
 * Tool Label Map -- Maps tool names to human-readable labels.
 *
 * Pure logic, no DOM dependency. Used by the speech bubble system
 * to show meaningful text instead of raw tool names.
 */

/**
 * Map of tool name patterns to display labels.
 * Checked in order -- first match wins.
 */
const LABEL_PATTERNS: Array<{ prefix: string; label: string }> = [
  // Quality tools
  { prefix: 'quality_tests',      label: 'Running tests...' },
  { prefix: 'quality_coverage',   label: 'Checking coverage...' },
  { prefix: 'quality_lint',       label: 'Linting code...' },
  { prefix: 'quality_complexity', label: 'Measuring complexity...' },
  { prefix: 'quality_gate',       label: 'Evaluating gate...' },
  { prefix: 'qgate_',             label: 'Running quality check...' },

  // Task tools
  { prefix: 'task_create',        label: 'Creating task...' },
  { prefix: 'task_search',        label: 'Searching tasks...' },
  { prefix: 'task_get',           label: 'Reading task...' },
  { prefix: 'task_update',        label: 'Updating task...' },
  { prefix: 'task_transition',    label: 'Transitioning task...' },

  // Workflow tools
  { prefix: 'workflow_step_run',  label: 'Running workflow...' },
  { prefix: 'workflow_',          label: 'Checking workflow...' },

  // Decision engine
  { prefix: 'decision_evaluate',  label: 'Evaluating decision...' },
  { prefix: 'decision_log',       label: 'Logging decision...' },
  { prefix: 'decision_',          label: 'Deciding...' },

  // Communication
  { prefix: 'team_message',       label: 'Sending message...' },
  { prefix: 'team_reply',         label: 'Replying...' },
  { prefix: 'team_inbox',         label: 'Reading inbox...' },
  { prefix: 'team_status',        label: 'Updating status...' },
  { prefix: 'team_assign',        label: 'Assigning work...' },

  // VCS tools
  { prefix: 'vcs_pr_create',      label: 'Opening PR...' },
  { prefix: 'vcs_pr_update',      label: 'Updating PR...' },
  { prefix: 'vcs_branch_create',  label: 'Creating branch...' },
  { prefix: 'vcs_label_sync',     label: 'Syncing labels...' },

  // Pipeline tools
  { prefix: 'pipeline_advance',   label: 'Advancing pipeline...' },
  { prefix: 'pipeline_start',     label: 'Starting pipeline...' },
  { prefix: 'pipeline_retry',     label: 'Retrying pipeline...' },
  { prefix: 'pipeline_',          label: 'Checking pipeline...' },

  // Project tools
  { prefix: 'project_',           label: 'Managing project...' },
];

/**
 * Get a human-readable label for a tool name.
 * Returns empty string for null (no bubble), 'Working...' for unknown tools.
 */
export function getToolLabel(toolName: string | null): string {
  if (!toolName) return '';

  for (const pattern of LABEL_PATTERNS) {
    if (toolName.startsWith(pattern.prefix)) {
      return pattern.label;
    }
  }

  return 'Working...';
}
