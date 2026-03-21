import { describe, it, expect, vi } from 'vitest';
import { renderTeamStatus, handleTeamStatus } from '../../src/commands/team-status.js';
import type { TeamStatusDataSource } from '../../src/commands/team-status.js';
import type { ApiMetricsResponse, ApiTimelineResponse } from '../../src/api-client.js';

function makeMetrics(overrides?: Partial<ApiMetricsResponse>): ApiMetricsResponse {
  return {
    timestamp: '2026-03-21T20:00:00Z',
    system: { status: 'healthy', activePipelines: 1 },
    agents: {
      'pm': { eventsInPeriod: 15 },
      'tech-lead': { eventsInPeriod: 0 },
      'po': { eventsInPeriod: 3 },
      'designer': { eventsInPeriod: 0 },
      'back-1': { eventsInPeriod: 8 },
      'front-1': { eventsInPeriod: 0 },
      'qa': { eventsInPeriod: 0 },
      'devops': { eventsInPeriod: 0 },
    },
    pipeline: { activeTasks: 1, stageDistribution: { IMPLEMENTATION: 1 } },
    costs: { totalTokens: 5000, byAgent: {} },
    budget: { globalConsumedUsd: 3.1, globalLimitUsd: 5.0, globalConsumedTokens: 12000, globalLimitTokens: 20000 },
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
      title: 'Complexity scorer',
      currentStage: 'IMPLEMENTATION',
      stages: [
        { stage: 'IDEA', enteredAt: '2026-03-21T19:00:00Z', completedAt: '2026-03-21T19:03:00Z', durationMs: 180000, agentId: 'pm' },
        { stage: 'IMPLEMENTATION', enteredAt: '2026-03-21T19:30:00Z', completedAt: null, durationMs: null, agentId: 'back-1' },
      ],
      totalDurationMs: null,
    }],
    ...overrides,
  };
}

describe('team-status', () => {
  describe('renderTeamStatus', () => {
    it('renders all 8 agents', () => {
      const result = renderTeamStatus(makeMetrics(), makeTimeline());
      expect(result).toContain('Team Status');
      expect(result).toContain('pm');
      expect(result).toContain('tech-lead');
      expect(result).toContain('back-1');
      expect(result).toContain('devops');
    });

    it('shows ON for active agents and off for idle', () => {
      const result = renderTeamStatus(makeMetrics(), makeTimeline());
      expect(result).toContain('ON  pm');
      expect(result).toContain('off tech-lead');
    });

    it('shows active pipeline task and stage', () => {
      const result = renderTeamStatus(makeMetrics(), makeTimeline());
      expect(result).toContain('IMPLEMENTATION');
      expect(result).toContain('ASK-0079');
    });

    it('shows budget percentage in footer', () => {
      const result = renderTeamStatus(makeMetrics(), makeTimeline());
      expect(result).toContain('Budget: 62%');
    });

    it('handles zero budget limit', () => {
      const metrics = makeMetrics({
        budget: { globalConsumedUsd: 0, globalLimitUsd: 0, globalConsumedTokens: 0, globalLimitTokens: 0 },
      });
      const result = renderTeamStatus(metrics, makeTimeline());
      expect(result).toContain('Budget: 0%');
    });

    it('shows -- for agents without active tasks', () => {
      const result = renderTeamStatus(makeMetrics(), makeTimeline());
      expect(result).toContain('off tech-lead');
    });
  });

  describe('handleTeamStatus', () => {
    it('fetches metrics and timeline and renders', async () => {
      const ds: TeamStatusDataSource = {
        getMetrics: vi.fn().mockResolvedValue(makeMetrics()),
        getTimeline: vi.fn().mockResolvedValue(makeTimeline()),
      };
      const result = await handleTeamStatus(ds);
      expect(result).toContain('Team Status');
      expect(ds.getMetrics).toHaveBeenCalledOnce();
      expect(ds.getTimeline).toHaveBeenCalledOnce();
    });

    it('returns error message on failure', async () => {
      const ds: TeamStatusDataSource = {
        getMetrics: vi.fn().mockRejectedValue(new Error('timeout')),
        getTimeline: vi.fn().mockResolvedValue(makeTimeline()),
      };
      const result = await handleTeamStatus(ds);
      expect(result).toContain('Team status unavailable');
      expect(result).toContain('timeout');
    });
  });
});
