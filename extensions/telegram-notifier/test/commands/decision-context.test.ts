import { describe, it, expect, vi } from 'vitest';
import { renderDecisionWithContext, renderDecisionsList, handleDecisions } from '../../src/commands/decision-context.js';
import type { DecisionContextDataSource } from '../../src/commands/decision-context.js';
import type { ApiDecision, ApiMetricsResponse } from '../../src/api-client.js';

function makeDecision(overrides?: Partial<ApiDecision>): ApiDecision {
  return {
    id: 'dec-001-abc123def456',
    category: 'tech_choice',
    question: 'Should we use ts-morph AST analysis or regex heuristics?',
    approver: 'human',
    created_at: '2026-03-21T20:00:00Z',
    ...overrides,
  };
}

function makeMetrics(): ApiMetricsResponse {
  return {
    timestamp: '2026-03-21T20:00:00Z',
    system: { status: 'healthy', activePipelines: 1 },
    agents: {},
    pipeline: { activeTasks: 1, stageDistribution: {} },
    costs: { totalTokens: 5000, byAgent: {} },
    budget: { globalConsumedUsd: 3.1, globalLimitUsd: 5.0, globalConsumedTokens: 12000, globalLimitTokens: 20000 },
    lastRefresh: null,
  };
}

describe('decision-context', () => {
  describe('renderDecisionWithContext', () => {
    it('renders decision details', () => {
      const result = renderDecisionWithContext(makeDecision(), null);
      expect(result).toContain('Decision:');
      expect(result).toContain('tech_choice');
      expect(result).toContain('ts-morph');
    });

    it('includes budget context when metrics available', () => {
      const result = renderDecisionWithContext(makeDecision(), makeMetrics());
      expect(result).toContain('Budget: 62% used');
      expect(result).toContain('1 pipeline(s)');
    });

    it('shows approve and reject commands', () => {
      const result = renderDecisionWithContext(makeDecision(), null);
      expect(result).toContain('/approve dec-001-abc123def456');
      expect(result).toContain('/reject dec-001-abc123def456');
    });
  });

  describe('renderDecisionsList', () => {
    it('renders multiple decisions', () => {
      const decisions = [makeDecision(), makeDecision({ id: 'dec-002', category: 'resource' })];
      const result = renderDecisionsList(decisions, makeMetrics());
      expect(result).toContain('tech_choice');
      expect(result).toContain('resource');
    });

    it('returns no pending decisions message when empty', () => {
      const result = renderDecisionsList([], null);
      expect(result).toContain('No pending decisions');
    });
  });

  describe('handleDecisions', () => {
    it('fetches decisions and metrics', async () => {
      const ds: DecisionContextDataSource = {
        listPendingDecisions: vi.fn().mockResolvedValue([makeDecision()]),
        getMetrics: vi.fn().mockResolvedValue(makeMetrics()),
      };
      const result = await handleDecisions(ds);
      expect(result).toContain('Decision:');
      expect(result).toContain('Budget');
    });

    it('renders decisions even if metrics fail', async () => {
      const ds: DecisionContextDataSource = {
        listPendingDecisions: vi.fn().mockResolvedValue([makeDecision()]),
        getMetrics: vi.fn().mockRejectedValue(new Error('timeout')),
      };
      const result = await handleDecisions(ds);
      expect(result).toContain('Decision:');
      expect(result).not.toContain('Budget');
    });

    it('returns error if decisions fail', async () => {
      const ds: DecisionContextDataSource = {
        listPendingDecisions: vi.fn().mockRejectedValue(new Error('db locked')),
        getMetrics: vi.fn().mockResolvedValue(makeMetrics()),
      };
      const result = await handleDecisions(ds);
      expect(result).toContain('Decisions unavailable');
    });
  });
});
