import { describe, it, expect, vi } from 'vitest';
import { renderHealthDashboard, handleHealth } from '../../src/commands/health-diagnostics.js';
import type { HealthDataSource } from '../../src/commands/health-diagnostics.js';
import type { ApiMetricsResponse } from '../../src/api-client.js';

function makeMetrics(overrides?: Partial<ApiMetricsResponse>): ApiMetricsResponse {
  return {
    timestamp: '2026-03-21T20:00:00Z',
    system: { status: 'healthy', activePipelines: 2 },
    agents: {
      'pm': { eventsInPeriod: 15 },
      'tech-lead': { eventsInPeriod: 0 },
      'back-1': { eventsInPeriod: 8 },
    },
    pipeline: { activeTasks: 2, stageDistribution: { IMPLEMENTATION: 1, QA: 1 } },
    costs: { totalTokens: 12450, byAgent: {} },
    budget: { globalConsumedUsd: 3.1, globalLimitUsd: 5.0, globalConsumedTokens: 12000, globalLimitTokens: 20000 },
    lastRefresh: null,
    ...overrides,
  };
}

describe('health-diagnostics', () => {
  describe('renderHealthDashboard', () => {
    it('renders system health section', () => {
      const result = renderHealthDashboard(makeMetrics());
      expect(result).toContain('System Health');
      expect(result).toContain('Gateway:   OK');
    });

    it('shows pipeline count', () => {
      const result = renderHealthDashboard(makeMetrics());
      expect(result).toContain('Pipelines: 2 active');
    });

    it('shows active agent count', () => {
      const result = renderHealthDashboard(makeMetrics());
      expect(result).toContain('Agents:    2/3 active');
    });

    it('shows budget percentage', () => {
      const result = renderHealthDashboard(makeMetrics());
      expect(result).toContain('Budget:    62%');
    });

    it('shows token usage', () => {
      const result = renderHealthDashboard(makeMetrics());
      expect(result).toContain('Tokens:    60%');
    });

    it('shows stage distribution', () => {
      const result = renderHealthDashboard(makeMetrics());
      expect(result).toContain('IMPLEMENTATION');
      expect(result).toContain('QA');
    });

    it('shows non-healthy status', () => {
      const metrics = makeMetrics({ system: { status: 'degraded', activePipelines: 0 } });
      const result = renderHealthDashboard(metrics);
      expect(result).toContain('Gateway:   degraded');
    });
  });

  describe('handleHealth', () => {
    it('fetches metrics and renders', async () => {
      const ds: HealthDataSource = {
        getMetrics: vi.fn().mockResolvedValue(makeMetrics()),
      };
      const result = await handleHealth(ds);
      expect(result).toContain('System Health');
    });

    it('returns error message on failure', async () => {
      const ds: HealthDataSource = {
        getMetrics: vi.fn().mockRejectedValue(new Error('connection refused')),
      };
      const result = await handleHealth(ds);
      expect(result).toContain('Health check unavailable');
    });
  });
});
