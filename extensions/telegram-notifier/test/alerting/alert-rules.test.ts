import { describe, it, expect } from 'vitest';
import {
  checkBudgetWarning,
  checkPipelineStalled,
  checkSystemHealth,
  checkAgentInactivity,
  evaluateAlertRules,
} from '../../src/alerting/alert-rules.js';
import type { ApiMetricsResponse, ApiTimelineResponse } from '../../src/api-client.js';

function makeMetrics(overrides?: Partial<ApiMetricsResponse>): ApiMetricsResponse {
  return {
    timestamp: '2026-03-21T20:00:00Z',
    system: { status: 'healthy', activePipelines: 1 },
    agents: { 'pm': { eventsInPeriod: 5 }, 'back-1': { eventsInPeriod: 3 } },
    pipeline: { activeTasks: 1, stageDistribution: {} },
    costs: { totalTokens: 5000, byAgent: {} },
    budget: { globalConsumedUsd: 3.0, globalLimitUsd: 5.0, globalConsumedTokens: 12000, globalLimitTokens: 20000 },
    lastRefresh: null,
    ...overrides,
  };
}

function makeTimeline(overrides?: Partial<ApiTimelineResponse>): ApiTimelineResponse {
  return {
    timestamp: '2026-03-21T20:00:00Z',
    activeTasks: 1,
    timelines: [{
      taskId: 'TASK-0079',
      title: 'Test',
      currentStage: 'IMPLEMENTATION',
      stages: [
        { stage: 'IMPLEMENTATION', enteredAt: '2026-03-21T19:30:00Z', completedAt: null, durationMs: null, agentId: 'back-1' },
      ],
      totalDurationMs: null,
    }],
    ...overrides,
  };
}

describe('alert-rules', () => {
  describe('checkBudgetWarning', () => {
    it('returns null when budget below 80%', () => {
      const metrics = makeMetrics({ budget: { globalConsumedUsd: 3.0, globalLimitUsd: 5.0, globalConsumedTokens: 0, globalLimitTokens: 0 } });
      expect(checkBudgetWarning(metrics)).toBeNull();
    });

    it('returns WARNING when budget at 80-94%', () => {
      const metrics = makeMetrics({ budget: { globalConsumedUsd: 4.2, globalLimitUsd: 5.0, globalConsumedTokens: 0, globalLimitTokens: 0 } });
      const result = checkBudgetWarning(metrics);
      expect(result?.severity).toBe('WARNING');
      expect(result?.type).toBe('BUDGET_WARNING');
    });

    it('returns CRITICAL when budget at 95%+', () => {
      const metrics = makeMetrics({ budget: { globalConsumedUsd: 4.8, globalLimitUsd: 5.0, globalConsumedTokens: 0, globalLimitTokens: 0 } });
      const result = checkBudgetWarning(metrics);
      expect(result?.severity).toBe('CRITICAL');
    });

    it('returns null when limit is zero', () => {
      const metrics = makeMetrics({ budget: { globalConsumedUsd: 0, globalLimitUsd: 0, globalConsumedTokens: 0, globalLimitTokens: 0 } });
      expect(checkBudgetWarning(metrics)).toBeNull();
    });
  });

  describe('checkPipelineStalled', () => {
    it('returns null when stage is within 15 minutes', () => {
      const now = new Date('2026-03-21T19:40:00Z').getTime(); // 10m after entry
      expect(checkPipelineStalled(makeTimeline(), now)).toBeNull();
    });

    it('returns CRITICAL when stage exceeds 15 minutes', () => {
      const now = new Date('2026-03-21T19:50:00Z').getTime(); // 20m after entry
      const result = checkPipelineStalled(makeTimeline(), now);
      expect(result?.severity).toBe('CRITICAL');
      expect(result?.type).toBe('PIPELINE_STALLED');
      expect(result?.message).toContain('IMPLEMENTATION');
    });

    it('returns null when no active stages', () => {
      const timeline = makeTimeline({ timelines: [] });
      expect(checkPipelineStalled(timeline)).toBeNull();
    });
  });

  describe('checkSystemHealth', () => {
    it('returns null when healthy', () => {
      expect(checkSystemHealth(makeMetrics())).toBeNull();
    });

    it('returns WARNING when degraded', () => {
      const metrics = makeMetrics({ system: { status: 'degraded', activePipelines: 0 } });
      const result = checkSystemHealth(metrics);
      expect(result?.severity).toBe('WARNING');
    });

    it('returns CRITICAL when down', () => {
      const metrics = makeMetrics({ system: { status: 'down', activePipelines: 0 } });
      const result = checkSystemHealth(metrics);
      expect(result?.severity).toBe('CRITICAL');
    });
  });

  describe('checkAgentInactivity', () => {
    it('returns null when agents are active', () => {
      expect(checkAgentInactivity(makeMetrics())).toBeNull();
    });

    it('returns WARNING when pipelines active but no agent activity', () => {
      const metrics = makeMetrics({
        agents: { 'pm': { eventsInPeriod: 0 }, 'back-1': { eventsInPeriod: 0 } },
        pipeline: { activeTasks: 1, stageDistribution: {} },
      });
      const result = checkAgentInactivity(metrics);
      expect(result?.type).toBe('AGENT_INACTIVITY');
    });

    it('returns null when no active pipelines and no activity', () => {
      const metrics = makeMetrics({
        agents: { 'pm': { eventsInPeriod: 0 } },
        pipeline: { activeTasks: 0, stageDistribution: {} },
      });
      expect(checkAgentInactivity(metrics)).toBeNull();
    });
  });

  describe('evaluateAlertRules', () => {
    it('returns empty array when everything is healthy', () => {
      const now = new Date('2026-03-21T19:40:00Z').getTime(); // 10m after stage entry (within 15m threshold)
      const results = evaluateAlertRules(makeMetrics(), makeTimeline(), now);
      expect(results).toEqual([]);
    });

    it('returns multiple alerts when multiple conditions met', () => {
      const metrics = makeMetrics({
        system: { status: 'degraded', activePipelines: 1 },
        budget: { globalConsumedUsd: 4.5, globalLimitUsd: 5.0, globalConsumedTokens: 0, globalLimitTokens: 0 },
      });
      const results = evaluateAlertRules(metrics, makeTimeline());
      const types = results.map(r => r.type);
      expect(types).toContain('BUDGET_WARNING');
      expect(types).toContain('SYSTEM_DEGRADED');
    });
  });
});
