/**
 * Task status definitions and state transition rules.
 *
 * The state machine defines the valid lifecycle of a TaskRecord:
 * backlog -> grooming -> design -> in_progress -> in_review -> qa -> done
 *
 * Additional transitions support rejection loops (in_review -> in_progress,
 * qa -> in_progress) and fast-track paths (grooming -> in_progress).
 */

export const TaskStatus = {
  Backlog: 'backlog',
  Grooming: 'grooming',
  Design: 'design',
  InProgress: 'in_progress',
  InReview: 'in_review',
  Qa: 'qa',
  Done: 'done',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const ALL_STATUSES: readonly TaskStatus[] = Object.values(TaskStatus);

/**
 * Valid state transitions map.
 *
 * Each key maps to the set of statuses it can transition to.
 * - grooming -> in_progress: supports FastTrack path (EP03)
 * - in_review -> in_progress: rejection loop
 * - qa -> in_progress: failure loop
 * - done: terminal state, no outbound transitions
 */
export const VALID_TRANSITIONS: ReadonlyMap<TaskStatus, readonly TaskStatus[]> =
  new Map<TaskStatus, readonly TaskStatus[]>([
    ['backlog', ['grooming']],
    ['grooming', ['design', 'in_progress']],
    ['design', ['in_progress']],
    ['in_progress', ['in_review']],
    ['in_review', ['qa', 'in_progress']],
    ['qa', ['done', 'in_progress']],
    ['done', []],
  ]);

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  const targets = VALID_TRANSITIONS.get(from);
  return targets !== undefined && targets.includes(to);
}
