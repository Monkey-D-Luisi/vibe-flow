/**
 * Stage Location Map -- Maps pipeline stages to office locations.
 *
 * Pure logic, no DOM dependency. Duplicates pipeline stage constants
 * from product-team since cross-extension runtime imports aren't possible.
 */

import type { FsmState } from './fsm-types.js';

/** Pipeline stages (mirrored from product-team/src/tools/pipeline.ts). */
export const PIPELINE_STAGES = [
  'IDEA', 'ROADMAP', 'REFINEMENT', 'DECOMPOSITION', 'DESIGN',
  'IMPLEMENTATION', 'QA', 'REVIEW', 'SHIPPING', 'DONE',
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number];

/** Stage owners (mirrored from product-team). */
export const STAGE_OWNERS: Record<PipelineStage, string> = {
  IDEA: 'pm',
  ROADMAP: 'pm',
  REFINEMENT: 'po',
  DECOMPOSITION: 'tech-lead',
  DESIGN: 'designer',
  IMPLEMENTATION: 'back-1',
  QA: 'qa',
  REVIEW: 'tech-lead',
  SHIPPING: 'devops',
  DONE: 'pm',
};

/** Target location in the office grid. */
export interface StageLocation {
  /** Target tile column. */
  readonly col: number;
  /** Target tile row. */
  readonly row: number;
  /** FSM state the agent should be in when at this location. */
  readonly activity: FsmState;
}

/**
 * Maps pipeline stages to office locations.
 *
 * - Early planning stages → meeting room (center row 4)
 * - DESIGN → designer desk area (col 12, row 2)
 * - IMPLEMENTATION → own desk (resolved per-agent at runtime)
 * - QA/REVIEW → own desk
 * - SHIPPING → server rack area
 * - DONE → back to own desk, idle
 */
export const STAGE_LOCATIONS: Record<PipelineStage, StageLocation | 'own-desk'> = {
  IDEA:           { col: 8,  row: 4, activity: 'meeting' },
  ROADMAP:        { col: 9,  row: 4, activity: 'meeting' },
  REFINEMENT:     { col: 10, row: 4, activity: 'meeting' },
  DECOMPOSITION:  { col: 9,  row: 3, activity: 'meeting' },
  DESIGN:         { col: 12, row: 3, activity: 'reading' },
  IMPLEMENTATION: 'own-desk',
  QA:             'own-desk',
  REVIEW:         'own-desk',
  SHIPPING:       { col: 16, row: 8, activity: 'typing' },
  DONE:           'own-desk',
};

/**
 * Get the target location for an agent given a pipeline stage.
 * If the stage maps to 'own-desk', returns the desk position
 * provided by the caller.
 */
export function getStageLocation(
  stage: string,
  deskCol: number,
  deskRow: number,
): StageLocation {
  const loc = STAGE_LOCATIONS[stage as PipelineStage];
  if (!loc) {
    return { col: deskCol, row: deskRow, activity: 'idle' };
  }
  if (loc === 'own-desk') {
    return { col: deskCol, row: deskRow, activity: 'typing' };
  }
  return loc;
}
