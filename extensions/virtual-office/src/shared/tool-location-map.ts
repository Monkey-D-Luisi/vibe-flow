/**
 * Tool Location Map -- Maps tool names to office locations.
 *
 * Pure logic, no DOM dependency. Determines where an agent should
 * walk when using a tool, based on semantic tool categories.
 *
 * Messaging tools (team_*) keep agents at their desk (like Slack/Teams).
 * Only decision meetings and deploy actions move agents away.
 */

/** Target location for an agent based on tool usage. */
export interface ToolLocation {
  readonly col: number;
  readonly row: number;
}

/** Meeting room top side (agents stand around table, not on it). */
const MEETING: ToolLocation = { col: 9, row: 4 };

/** Server rack area. */
const SERVER_RACK: ToolLocation = { col: 16, row: 8 };

/**
 * Tool patterns that move agents away from their desk.
 * Everything not listed here defaults to own desk (no movement).
 */
const AWAY_PATTERNS: Array<{ prefix: string; location: ToolLocation }> = [
  // Decision meetings → meeting room (real face-to-face discussion)
  { prefix: 'decision_evaluate', location: MEETING },
  { prefix: 'decision_log',     location: MEETING },

  // VCS deploy actions → server rack
  { prefix: 'vcs_pr_create', location: SERVER_RACK },
  { prefix: 'vcs_pr_update', location: SERVER_RACK },

  // Pipeline advance → server rack
  { prefix: 'pipeline_advance', location: SERVER_RACK },
];

/**
 * Get the target location for an agent based on the tool being used.
 * Returns the agent's desk position for tools that don't require movement.
 */
export function getToolLocation(
  toolName: string | null,
  homeCol: number,
  homeRow: number,
): ToolLocation {
  if (!toolName) return { col: homeCol, row: homeRow };

  for (const pattern of AWAY_PATTERNS) {
    if (toolName.startsWith(pattern.prefix)) {
      return pattern.location;
    }
  }

  return { col: homeCol, row: homeRow };
}
