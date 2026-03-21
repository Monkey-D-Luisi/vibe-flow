import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertEngine } from '../../src/alerting/alert-engine.js';
import type { ProductTeamApiClient, ApiMetricsResponse, ApiTimelineResponse } from '../../src/api-client.js';

function makeMetrics(overrides?: Partial<ApiMetricsResponse>): ApiMetricsResponse {
  return {
    timestamp: '2026-03-21T20:00:00Z',
    system: { status: 'healthy', activePipelines: 0 },
    agents: {},
    pipeline: { activeTasks: 0, stageDistribution: {} },
    costs: { totalTokens: 0, byAgent: {} },
    budget: { globalConsumedUsd: 1.0, globalLimitUsd: 5.0, globalConsumedTokens: 5000, globalLimitTokens: 20000 },
    lastRefresh: null,
    ...overrides,
  };
}

function makeTimeline(): ApiTimelineResponse {
  return { timestamp: '2026-03-21T20:00:00Z', activeTasks: 0, timelines: [] };
}

function mockApi(metrics?: ApiMetricsResponse, timeline?: ApiTimelineResponse): ProductTeamApiClient {
  return {
    getBudgetByScope: vi.fn(),
    listBudgetByScope: vi.fn(),
    replenishBudget: vi.fn(),
    resetBudgetConsumption: vi.fn(),
    listPendingDecisions: vi.fn(),
    approveDecision: vi.fn(),
    rejectDecision: vi.fn(),
    getMetrics: vi.fn().mockResolvedValue(metrics ?? makeMetrics()),
    getTimeline: vi.fn().mockResolvedValue(timeline ?? makeTimeline()),
    getHeatmap: vi.fn(),
  } as unknown as ProductTeamApiClient;
}

function mockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('AlertEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('does not start when disabled', () => {
    const api = mockApi();
    const enqueue = vi.fn();
    const engine = new AlertEngine(api, enqueue, mockLogger(), { enabled: false, pollIntervalMs: 1000 });
    engine.start();
    expect(engine.running).toBe(false);
    engine.stop();
  });

  it('starts and stops cleanly', () => {
    const api = mockApi();
    const enqueue = vi.fn();
    const engine = new AlertEngine(api, enqueue, mockLogger(), { enabled: true, pollIntervalMs: 1000 });
    engine.start();
    expect(engine.running).toBe(true);
    engine.stop();
    expect(engine.running).toBe(false);
  });

  it('polls and enqueues alerts when conditions are met', async () => {
    const metrics = makeMetrics({
      budget: { globalConsumedUsd: 4.5, globalLimitUsd: 5.0, globalConsumedTokens: 0, globalLimitTokens: 0 },
    });
    const api = mockApi(metrics);
    const enqueue = vi.fn();
    const engine = new AlertEngine(api, enqueue, mockLogger(), { enabled: true, pollIntervalMs: 1000 });

    await engine.poll();

    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0][0]).toContain('BUDGET_WARNING');
    expect(enqueue.mock.calls[0][1]).toBe('normal');
    engine.stop();
  });

  it('respects cooldown -- does not re-enqueue during cooldown', async () => {
    const metrics = makeMetrics({
      budget: { globalConsumedUsd: 4.5, globalLimitUsd: 5.0, globalConsumedTokens: 0, globalLimitTokens: 0 },
    });
    const api = mockApi(metrics);
    const enqueue = vi.fn();
    const engine = new AlertEngine(api, enqueue, mockLogger(), { enabled: true, pollIntervalMs: 1000 });

    await engine.poll();
    expect(enqueue).toHaveBeenCalledOnce();

    // Second poll within cooldown should not re-enqueue
    await engine.poll();
    expect(enqueue).toHaveBeenCalledOnce();
    engine.stop();
  });

  it('handles API errors gracefully', async () => {
    const api = mockApi();
    (api.getMetrics as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout'));
    const enqueue = vi.fn();
    const logger = mockLogger();
    const engine = new AlertEngine(api, enqueue, logger, { enabled: true, pollIntervalMs: 1000 });

    await engine.poll();
    expect(enqueue).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
    engine.stop();
  });

  it('does not enqueue when no alert conditions met', async () => {
    const api = mockApi();
    const enqueue = vi.fn();
    const engine = new AlertEngine(api, enqueue, mockLogger(), { enabled: true, pollIntervalMs: 1000 });

    await engine.poll();
    expect(enqueue).not.toHaveBeenCalled();
    engine.stop();
  });
});
