/**
 * Agent Entity -- An agent character in the virtual office.
 *
 * Holds position, visual properties, and animation state.
 */

import { createFsm, transitionFsm, tickFsm } from './character-fsm.js';
import type { CharacterFsm, FsmState } from './character-fsm.js';
import { isWalkable } from '../../shared/tile-data.js';

export interface AgentEntity {
  /** Agent identifier (e.g. 'pm', 'qa'). */
  readonly id: string;
  /** Short display label (e.g. 'PM', 'QA'). */
  readonly label: string;
  /** Brand color (hex). */
  readonly color: string;
  /** Current tile X position (can be fractional during movement). */
  x: number;
  /** Current tile Y position (can be fractional during movement). */
  y: number;
  /** Target tile X for movement. */
  targetX: number;
  /** Target tile Y for movement. */
  targetY: number;
  /** Desk home position X. */
  readonly homeX: number;
  /** Desk home position Y. */
  readonly homeY: number;
  /** Character animation state machine. */
  readonly fsm: CharacterFsm;
  /** Current FSM state (delegated from fsm). */
  readonly fsmState: FsmState;
}

const MOVE_SPEED = 0.04; // tiles per tick (~2.4 tiles/sec at 60fps)

/** Create an agent entity at its desk position. */
export function createAgent(
  id: string,
  label: string,
  color: string,
  col: number,
  row: number,
): AgentEntity {
  const fsm = createFsm();
  return {
    id,
    label,
    color,
    x: col,
    y: row,
    targetX: col,
    targetY: row,
    homeX: col,
    homeY: row,
    fsm,
    get fsmState() { return fsm.state; },
  };
}

/** Set a movement target for the agent. */
export function setTarget(agent: AgentEntity, col: number, row: number): void {
  if (!isWalkable(Math.round(col), Math.round(row))) return;
  agent.targetX = col;
  agent.targetY = row;
  if (agent.x !== col || agent.y !== row) {
    transitionFsm(agent.fsm, 'walking');
  }
}

/** Update agent position and animation each tick. */
export function tickAgent(agent: AgentEntity, dt: number): void {
  // Movement interpolation
  const dx = agent.targetX - agent.x;
  const dy = agent.targetY - agent.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0.05) {
    // Move toward target
    const step = Math.min(MOVE_SPEED, dist);
    agent.x += (dx / dist) * step;
    agent.y += (dy / dist) * step;

    if (agent.fsm.state !== 'walking') {
      transitionFsm(agent.fsm, 'walking');
    }
  } else if (agent.fsm.state === 'walking') {
    // Arrived at target
    agent.x = agent.targetX;
    agent.y = agent.targetY;
    transitionFsm(agent.fsm, 'idle');
  }

  tickFsm(agent.fsm, dt);
}

/** Set the agent's animation state (e.g. from server-side state mapping). */
export function setAgentState(agent: AgentEntity, state: FsmState): void {
  transitionFsm(agent.fsm, state);
}
