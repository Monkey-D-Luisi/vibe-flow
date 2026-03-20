/**
 * Character FSM -- Frontend animation state machine.
 *
 * Wraps the shared FSM types with mutable state for each agent character.
 */

import {
  FSM_CONFIG, canTransition, computeFrame,
} from '../../shared/fsm-types.js';
import type { FsmState } from '../../shared/fsm-types.js';

export type { FsmState } from '../../shared/fsm-types.js';

export interface CharacterFsm {
  /** Current animation state. */
  state: FsmState;
  /** Elapsed time in current state (ms). */
  elapsed: number;
  /** Current animation frame index. */
  frameIndex: number;
}

/** Create a new FSM starting in idle state. */
export function createFsm(): CharacterFsm {
  return { state: 'idle', elapsed: 0, frameIndex: 0 };
}

/**
 * Attempt to transition the FSM to a new state.
 * Returns true if the transition was valid and applied.
 */
export function transitionFsm(fsm: CharacterFsm, to: FsmState): boolean {
  if (!canTransition(fsm.state, to)) return false;
  if (fsm.state === to) return true; // no-op self-transition
  fsm.state = to;
  fsm.elapsed = 0;
  fsm.frameIndex = 0;
  return true;
}

/** Advance the FSM by `dt` milliseconds. Updates frame index. */
export function tickFsm(fsm: CharacterFsm, dt: number): void {
  fsm.elapsed += dt;
  const config = FSM_CONFIG[fsm.state];
  const { frameIndex, cycled } = computeFrame(fsm.state, fsm.elapsed);
  fsm.frameIndex = frameIndex;

  // Auto-transition to next state if configured and cycle completed
  if (cycled && config.nextState) {
    transitionFsm(fsm, config.nextState);
  }
}
