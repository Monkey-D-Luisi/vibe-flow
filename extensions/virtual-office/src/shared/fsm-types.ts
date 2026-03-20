/**
 * FSM Types -- Character animation state machine definitions.
 *
 * Pure logic, no DOM dependency. Used by both server-side tests (vitest)
 * and frontend rendering (esbuild).
 */

/** Animation states an agent character can be in. */
export type FsmState = 'idle' | 'walking' | 'typing' | 'reading' | 'meeting';

/** All valid FSM states. */
export const FSM_STATES: readonly FsmState[] = [
  'idle', 'walking', 'typing', 'reading', 'meeting',
] as const;

/** Configuration for a single animation state. */
export interface FsmStateConfig {
  /** Number of animation frames in this state. */
  readonly frameCount: number;
  /** Duration of each frame in milliseconds. */
  readonly frameDurationMs: number;
  /** State to auto-transition to when action completes (undefined = loop). */
  readonly nextState?: FsmState;
}

/** Animation configuration per state. */
export const FSM_CONFIG: Record<FsmState, FsmStateConfig> = {
  idle:    { frameCount: 2, frameDurationMs: 800 },
  walking: { frameCount: 4, frameDurationMs: 150 },
  typing:  { frameCount: 2, frameDurationMs: 400 },
  reading: { frameCount: 2, frameDurationMs: 600 },
  meeting: { frameCount: 2, frameDurationMs: 700 },
};

/** Valid state transitions. Key = from, values = allowed destinations. */
export const FSM_TRANSITIONS: Record<FsmState, readonly FsmState[]> = {
  idle:    ['walking', 'typing', 'reading', 'meeting'],
  walking: ['idle', 'typing', 'reading', 'meeting'],
  typing:  ['idle', 'walking'],
  reading: ['idle', 'walking'],
  meeting: ['idle', 'walking'],
};

/**
 * Check if a transition from one FSM state to another is valid.
 * Self-transitions are always valid (no-op).
 */
export function canTransition(from: FsmState, to: FsmState): boolean {
  if (from === to) return true;
  return FSM_TRANSITIONS[from].includes(to);
}

/**
 * Compute the next animation frame index given elapsed time.
 * Returns { frameIndex, elapsed } where elapsed is clamped to cycle duration.
 */
export function computeFrame(
  state: FsmState,
  elapsedMs: number,
): { frameIndex: number; cycled: boolean } {
  const config = FSM_CONFIG[state];
  const cycleDuration = config.frameCount * config.frameDurationMs;
  const cycled = elapsedMs >= cycleDuration;
  const clamped = elapsedMs % cycleDuration;
  const frameIndex = Math.floor(clamped / config.frameDurationMs);
  return { frameIndex, cycled };
}
