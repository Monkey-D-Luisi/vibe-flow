import { describe, it, expect, beforeEach } from 'vitest';
import { tickPatrol, resetPatrol, getPatrolPhase, PatrolPhase } from '../src/public/agents/idle-patrol.js';

describe('idle-patrol (coffee cycle FSM)', () => {
  let testId = 0;
  function uniqueId(): string {
    return `test-agent-${testId++}`;
  }

  beforeEach(() => {
    testId++;
  });

  it('starts in IDLE phase', () => {
    const id = uniqueId();
    const result = tickPatrol(id, 0, 3, 6, 3, 6);
    expect(result.phase).toBe(PatrolPhase.IDLE);
    expect(result.target).toBeNull();
  });

  it('returns null target during idle cooldown', () => {
    const id = uniqueId();
    const result = tickPatrol(id, 0, 3, 6, 3, 6);
    expect(result.target).toBeNull();
  });

  it('eventually transitions to WALKING_TO_COFFEE after enough ticks', () => {
    const id = uniqueId();
    let result = tickPatrol(id, 0, 3, 6, 3, 6);

    for (let i = 0; i < 3000; i++) {
      result = tickPatrol(id, 0, 3, 6, 3, 6);
      if (result.phase === PatrolPhase.WALKING_TO_COFFEE) break;
    }

    expect(result.phase).toBe(PatrolPhase.WALKING_TO_COFFEE);
    expect(result.target).not.toBeNull();
    expect(result.target).toHaveProperty('col');
    expect(result.target).toHaveProperty('row');
  });

  it('transitions to AT_COFFEE when agent arrives at coffee spot', () => {
    const id = uniqueId();

    // Tick until WALKING_TO_COFFEE
    let result = tickPatrol(id, 0, 3, 6, 3, 6);
    for (let i = 0; i < 3000; i++) {
      result = tickPatrol(id, 0, 3, 6, 3, 6);
      if (result.phase === PatrolPhase.WALKING_TO_COFFEE) break;
    }

    const coffeeTarget = result.target;
    expect(coffeeTarget).not.toBeNull();

    // Simulate arrival at coffee spot
    result = tickPatrol(id, 0, 3, 6, coffeeTarget!.col, coffeeTarget!.row);
    expect(result.phase).toBe(PatrolPhase.AT_COFFEE);
  });

  it('transitions to WALKING_HOME after coffee pause', () => {
    const id = uniqueId();

    // Tick to WALKING_TO_COFFEE
    let result = tickPatrol(id, 0, 3, 6, 3, 6);
    for (let i = 0; i < 3000; i++) {
      result = tickPatrol(id, 0, 3, 6, 3, 6);
      if (result.phase === PatrolPhase.WALKING_TO_COFFEE) break;
    }
    const coffeeTarget = result.target!;

    // Arrive at coffee
    tickPatrol(id, 0, 3, 6, coffeeTarget.col, coffeeTarget.row);

    // Tick through coffee pause (max 300 ticks)
    for (let i = 0; i < 400; i++) {
      result = tickPatrol(id, 0, 3, 6, coffeeTarget.col, coffeeTarget.row);
      if (result.phase === PatrolPhase.WALKING_HOME) break;
    }

    expect(result.phase).toBe(PatrolPhase.WALKING_HOME);
    expect(result.target).toEqual({ col: 3, row: 6 });
  });

  it('returns to IDLE after arriving home', () => {
    const id = uniqueId();

    // Complete a full cycle: IDLE → WALK_COFFEE → AT_COFFEE → WALK_HOME
    let result = tickPatrol(id, 0, 3, 6, 3, 6);
    for (let i = 0; i < 3000; i++) {
      result = tickPatrol(id, 0, 3, 6, 3, 6);
      if (result.phase === PatrolPhase.WALKING_TO_COFFEE) break;
    }
    const coffeeTarget = result.target!;

    // Arrive at coffee
    tickPatrol(id, 0, 3, 6, coffeeTarget.col, coffeeTarget.row);

    // Wait at coffee
    for (let i = 0; i < 400; i++) {
      result = tickPatrol(id, 0, 3, 6, coffeeTarget.col, coffeeTarget.row);
      if (result.phase === PatrolPhase.WALKING_HOME) break;
    }

    // Arrive home
    result = tickPatrol(id, 0, 3, 6, 3, 6);
    expect(result.phase).toBe(PatrolPhase.IDLE);
  });

  it('assigns different coffee spots to different agents', () => {
    const id0 = uniqueId();
    const id1 = uniqueId();

    let target0 = null;
    let target1 = null;

    for (let i = 0; i < 5000; i++) {
      const r0 = tickPatrol(id0, 0, 3, 2, 3, 2);
      if (r0.target && !target0) target0 = r0.target;

      const r1 = tickPatrol(id1, 1, 6, 2, 6, 2);
      if (r1.target && !target1) target1 = r1.target;

      if (target0 && target1) break;
    }

    expect(target0).not.toBeNull();
    expect(target1).not.toBeNull();
    // Agent 0 → spot 0 (15,3), Agent 1 → spot 1 (16,3)
    expect(target0).not.toEqual(target1);
  });

  it('resetPatrol returns agent to IDLE phase', () => {
    const id = uniqueId();

    let result = tickPatrol(id, 0, 3, 6, 3, 6);
    for (let i = 0; i < 3000; i++) {
      result = tickPatrol(id, 0, 3, 6, 3, 6);
      if (result.phase === PatrolPhase.WALKING_TO_COFFEE) break;
    }

    expect(getPatrolPhase(id)).toBe(PatrolPhase.WALKING_TO_COFFEE);
    resetPatrol(id);
    expect(getPatrolPhase(id)).toBe(PatrolPhase.IDLE);
  });

  it('resetPatrol is safe on unknown agent ID', () => {
    expect(() => resetPatrol('nonexistent')).not.toThrow();
  });

  it('getPatrolPhase returns IDLE for unknown agent', () => {
    expect(getPatrolPhase('unknown-agent')).toBe(PatrolPhase.IDLE);
  });

  it('coffee target is within walkable area', () => {
    const id = uniqueId();
    let result = tickPatrol(id, 0, 3, 6, 3, 6);

    for (let i = 0; i < 3000; i++) {
      result = tickPatrol(id, 0, 3, 6, 3, 6);
      if (result.target) break;
    }

    if (result.target) {
      expect(result.target.col).toBeGreaterThanOrEqual(1);
      expect(result.target.col).toBeLessThanOrEqual(18);
      expect(result.target.row).toBeGreaterThanOrEqual(1);
      expect(result.target.row).toBeLessThanOrEqual(10);
    }
  });
});
