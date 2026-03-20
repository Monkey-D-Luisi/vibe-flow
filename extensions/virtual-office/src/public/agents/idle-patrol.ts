/**
 * Idle Patrol -- Coffee cycle FSM for idle agents.
 *
 * When agents have no active work, they periodically walk to the coffee
 * area, pause briefly, then return to their desk. This gives the office
 * visual life while keeping agents organized.
 *
 * FSM phases:
 *   IDLE_AT_DESK → WALKING_TO_COFFEE → AT_COFFEE → WALKING_HOME → IDLE_AT_DESK
 *
 * Each agent gets an assigned coffee spot (by index) to prevent overlap.
 */

/** Patrol phase enum. */
export const PatrolPhase = {
  IDLE: 0,
  WALKING_TO_COFFEE: 1,
  AT_COFFEE: 2,
  WALKING_HOME: 3,
} as const;

export type PatrolPhaseValue = typeof PatrolPhase[keyof typeof PatrolPhase];

/** Result returned by tickPatrol each frame. */
export interface PatrolResult {
  /** Target to setTarget on the agent, or null if no change needed. */
  target: { col: number; row: number } | null;
  /** Current patrol phase. */
  phase: PatrolPhaseValue;
}

interface PatrolState {
  phase: PatrolPhaseValue;
  /** Ticks remaining in current phase. */
  timer: number;
  /** Assigned coffee spot for this agent. */
  coffeeCol: number;
  coffeeRow: number;
}

/** Patrol state per agent. */
const patrols = new Map<string, PatrolState>();

/** Seeded pseudo-random for deterministic timing. */
let rngState = 1;
function pseudoRandom(): number {
  rngState = (rngState * 1664525 + 1013904223) & 0x7fffffff;
  return rngState / 0x7fffffff;
}

/**
 * Coffee spots — 8 positions in and around the coffee area.
 * Assigned by agentIndex to prevent overlap.
 */
const COFFEE_SPOTS: ReadonlyArray<{ col: number; row: number }> = [
  { col: 15, row: 3 },
  { col: 16, row: 3 },
  { col: 17, row: 3 },
  { col: 14, row: 3 },
  { col: 15, row: 4 },
  { col: 16, row: 4 },
  { col: 17, row: 4 },
  { col: 14, row: 4 },
];

/** Min/max idle cooldown ticks (720-1500 = 12-25s at 60fps). */
const MIN_IDLE_TICKS = 720;
const MAX_IDLE_TICKS = 1500;

/** Pause at coffee (180-300 ticks = 3-5s at 60fps). */
const MIN_COFFEE_TICKS = 180;
const MAX_COFFEE_TICKS = 300;

function randomIdleCooldown(): number {
  return MIN_IDLE_TICKS + Math.floor(pseudoRandom() * (MAX_IDLE_TICKS - MIN_IDLE_TICKS));
}

function randomCoffeePause(): number {
  return MIN_COFFEE_TICKS + Math.floor(pseudoRandom() * (MAX_COFFEE_TICKS - MIN_COFFEE_TICKS));
}

function getOrCreateState(agentId: string, agentIndex: number): PatrolState {
  let state = patrols.get(agentId);
  if (!state) {
    const spot = COFFEE_SPOTS[agentIndex % COFFEE_SPOTS.length];
    // Stagger initial cooldown by agent index
    state = {
      phase: PatrolPhase.IDLE,
      timer: agentIndex * 180 + randomIdleCooldown(),
      coffeeCol: spot.col,
      coffeeRow: spot.row,
    };
    patrols.set(agentId, state);
  }
  return state;
}

/**
 * Tick the patrol FSM for an idle agent.
 *
 * @param agentId - Agent identifier
 * @param agentIndex - Agent index (0-7) for spot assignment
 * @param homeCol - Agent's desk column
 * @param homeRow - Agent's desk row
 * @param currentX - Agent's current x position
 * @param currentY - Agent's current y position
 */
export function tickPatrol(
  agentId: string,
  agentIndex: number,
  homeCol: number,
  homeRow: number,
  currentX: number,
  currentY: number,
): PatrolResult {
  const state = getOrCreateState(agentId, agentIndex);

  switch (state.phase) {
    case PatrolPhase.IDLE: {
      state.timer--;
      if (state.timer <= 0) {
        state.phase = PatrolPhase.WALKING_TO_COFFEE;
        return {
          target: { col: state.coffeeCol, row: state.coffeeRow },
          phase: PatrolPhase.WALKING_TO_COFFEE,
        };
      }
      return { target: null, phase: PatrolPhase.IDLE };
    }

    case PatrolPhase.WALKING_TO_COFFEE: {
      // Check if arrived at coffee spot
      const atCoffee =
        Math.abs(currentX - state.coffeeCol) < 0.1 &&
        Math.abs(currentY - state.coffeeRow) < 0.1;
      if (atCoffee) {
        state.phase = PatrolPhase.AT_COFFEE;
        state.timer = randomCoffeePause();
      }
      return { target: null, phase: state.phase };
    }

    case PatrolPhase.AT_COFFEE: {
      state.timer--;
      if (state.timer <= 0) {
        state.phase = PatrolPhase.WALKING_HOME;
        return {
          target: { col: homeCol, row: homeRow },
          phase: PatrolPhase.WALKING_HOME,
        };
      }
      return { target: null, phase: PatrolPhase.AT_COFFEE };
    }

    case PatrolPhase.WALKING_HOME: {
      // Check if arrived home
      const atHome =
        Math.abs(currentX - homeCol) < 0.1 &&
        Math.abs(currentY - homeRow) < 0.1;
      if (atHome) {
        state.phase = PatrolPhase.IDLE;
        state.timer = randomIdleCooldown();
      }
      return { target: null, phase: state.phase };
    }

    default:
      return { target: null, phase: PatrolPhase.IDLE };
  }
}

/** Reset patrol when agent gets real work. Returns to IDLE phase. */
export function resetPatrol(agentId: string): void {
  const state = patrols.get(agentId);
  if (state) {
    state.phase = PatrolPhase.IDLE;
    state.timer = randomIdleCooldown();
  }
}

/** Get the current phase of an agent's patrol (for external queries). */
export function getPatrolPhase(agentId: string): PatrolPhaseValue {
  return patrols.get(agentId)?.phase ?? PatrolPhase.IDLE;
}
