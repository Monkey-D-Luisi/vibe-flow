import { describe, it, expect, beforeEach } from 'vitest';
import {
  publishAgentBudgetState,
  getAgentBudgetState,
  getBudgetRemainingFraction,
  clearBudgetStates,
  clearAgentBudgetState,
  listBudgetStates,
  type AgentBudgetState,
} from '../src/budget-integration.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeState(overrides?: Partial<AgentBudgetState>): AgentBudgetState {
  return {
    agentId: 'back-1',
    consumptionRatio: 0.3,
    status: 'active',
    updatedAt: '2026-03-09T12:00:00Z',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  clearBudgetStates();
});

/* ------------------------------------------------------------------ */
/*  publishAgentBudgetState / getAgentBudgetState                      */
/* ------------------------------------------------------------------ */

describe('publishAgentBudgetState / getAgentBudgetState', () => {
  it('stores and retrieves agent budget state', () => {
    const state = makeState();
    publishAgentBudgetState(state);

    const retrieved = getAgentBudgetState('back-1');
    expect(retrieved).toEqual(state);
  });

  it('returns undefined for unknown agent', () => {
    expect(getAgentBudgetState('unknown-agent')).toBeUndefined();
  });

  it('overwrites previous state for same agent', () => {
    publishAgentBudgetState(makeState({ consumptionRatio: 0.3 }));
    publishAgentBudgetState(makeState({ consumptionRatio: 0.7 }));

    const retrieved = getAgentBudgetState('back-1');
    expect(retrieved?.consumptionRatio).toBe(0.7);
  });

  it('stores multiple agents independently', () => {
    publishAgentBudgetState(makeState({ agentId: 'back-1', consumptionRatio: 0.2 }));
    publishAgentBudgetState(makeState({ agentId: 'front-1', consumptionRatio: 0.6 }));

    expect(getAgentBudgetState('back-1')?.consumptionRatio).toBe(0.2);
    expect(getAgentBudgetState('front-1')?.consumptionRatio).toBe(0.6);
  });
});

/* ------------------------------------------------------------------ */
/*  getBudgetRemainingFraction                                         */
/* ------------------------------------------------------------------ */

describe('getBudgetRemainingFraction', () => {
  it('returns 1 - consumptionRatio for known agent', () => {
    publishAgentBudgetState(makeState({ consumptionRatio: 0.3 }));
    expect(getBudgetRemainingFraction('back-1')).toBeCloseTo(0.7);
  });

  it('returns undefined for unknown agent (fail-open)', () => {
    expect(getBudgetRemainingFraction('unknown-agent')).toBeUndefined();
  });

  it('returns 0 when consumption is 100%', () => {
    publishAgentBudgetState(makeState({ consumptionRatio: 1.0 }));
    expect(getBudgetRemainingFraction('back-1')).toBe(0);
  });

  it('returns 1 when consumption is 0%', () => {
    publishAgentBudgetState(makeState({ consumptionRatio: 0 }));
    expect(getBudgetRemainingFraction('back-1')).toBe(1);
  });

  it('clamps to 0 when consumption exceeds 100%', () => {
    publishAgentBudgetState(makeState({ consumptionRatio: 1.5 }));
    expect(getBudgetRemainingFraction('back-1')).toBe(0);
  });

  it('returns correct fraction for 50% consumption (AC2 threshold)', () => {
    publishAgentBudgetState(makeState({ consumptionRatio: 0.5 }));
    expect(getBudgetRemainingFraction('back-1')).toBeCloseTo(0.5);
  });

  it('returns correct fraction for 80% consumption (AC3 threshold)', () => {
    publishAgentBudgetState(makeState({ consumptionRatio: 0.8 }));
    expect(getBudgetRemainingFraction('back-1')).toBeCloseTo(0.2);
  });
});

/* ------------------------------------------------------------------ */
/*  clearBudgetStates                                                  */
/* ------------------------------------------------------------------ */

describe('clearBudgetStates', () => {
  it('removes all budget states', () => {
    publishAgentBudgetState(makeState({ agentId: 'back-1' }));
    publishAgentBudgetState(makeState({ agentId: 'front-1' }));

    clearBudgetStates();

    expect(getAgentBudgetState('back-1')).toBeUndefined();
    expect(getAgentBudgetState('front-1')).toBeUndefined();
  });

  it('is idempotent on empty registry', () => {
    clearBudgetStates();
    clearBudgetStates();
    expect(listBudgetStates()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  clearAgentBudgetState                                              */
/* ------------------------------------------------------------------ */

describe('clearAgentBudgetState', () => {
  it('removes state for specific agent and returns true', () => {
    publishAgentBudgetState(makeState({ agentId: 'back-1' }));
    publishAgentBudgetState(makeState({ agentId: 'front-1' }));

    const deleted = clearAgentBudgetState('back-1');
    expect(deleted).toBe(true);
    expect(getAgentBudgetState('back-1')).toBeUndefined();
    expect(getAgentBudgetState('front-1')).toBeDefined();
  });

  it('returns false for unknown agent', () => {
    expect(clearAgentBudgetState('non-existent')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  listBudgetStates                                                   */
/* ------------------------------------------------------------------ */

describe('listBudgetStates', () => {
  it('returns empty array when no states exist', () => {
    expect(listBudgetStates()).toEqual([]);
  });

  it('returns all published states', () => {
    publishAgentBudgetState(makeState({ agentId: 'back-1', consumptionRatio: 0.2 }));
    publishAgentBudgetState(makeState({ agentId: 'front-1', consumptionRatio: 0.6 }));

    const states = listBudgetStates();
    expect(states).toHaveLength(2);

    const ids = states.map((s) => s.agentId).sort();
    expect(ids).toEqual(['back-1', 'front-1']);
  });

  it('returns a snapshot (not a live reference)', () => {
    publishAgentBudgetState(makeState({ agentId: 'back-1' }));

    const snapshot = listBudgetStates();
    expect(snapshot).toHaveLength(1);

    clearBudgetStates();
    // snapshot should still have 1 item
    expect(snapshot).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Cross-extension contract: globalThis registry                      */
/* ------------------------------------------------------------------ */

describe('globalThis registry contract', () => {
  it('uses Symbol.for so both extensions share the same key', () => {
    // Simulate what product-team/src/index.ts does (inline publisher)
    const registryKey = Symbol.for('openclaw:budget-state-registry');
    const g = globalThis as Record<symbol, unknown>;
    if (!g[registryKey]) g[registryKey] = new Map<string, unknown>();
    (g[registryKey] as Map<string, unknown>).set('test-agent', {
      agentId: 'test-agent',
      consumptionRatio: 0.42,
      status: 'warning',
      updatedAt: '2026-03-09T12:00:00Z',
    });

    // Model-router should see it via getBudgetRemainingFraction
    const fraction = getBudgetRemainingFraction('test-agent');
    expect(fraction).toBeCloseTo(0.58);
  });

  it('model-router reads state published by product-team publisher pattern', () => {
    // This mirrors the exact publisher code from product-team/src/index.ts
    const budgetStatePublisher = (state: { agentId: string; consumptionRatio: number; status: string; updatedAt: string }) => {
      const rk = Symbol.for('openclaw:budget-state-registry');
      const gl = globalThis as Record<symbol, unknown>;
      if (!gl[rk]) gl[rk] = new Map<string, unknown>();
      (gl[rk] as Map<string, unknown>).set(state.agentId, state);
    };

    budgetStatePublisher({
      agentId: 'qa',
      consumptionRatio: 0.85,
      status: 'exhausted',
      updatedAt: '2026-03-09T14:00:00Z',
    });

    // Model-router reads via the integration module
    const state = getAgentBudgetState('qa');
    expect(state).toBeDefined();
    expect(state!.consumptionRatio).toBe(0.85);
    expect(state!.status).toBe('exhausted');

    const fraction = getBudgetRemainingFraction('qa');
    expect(fraction).toBeCloseTo(0.15);
  });
});
