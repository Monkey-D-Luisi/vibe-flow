import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatStandupSummary,
  StandupScheduler,
  type StandupDataSource,
} from '../../src/standup/daily-standup.js';
import type { ApiMetricsResponse, ApiTimelineResponse } from '../../src/api-client.js';

function makeMetrics(overrides?: Partial<ApiMetricsResponse>): ApiMetricsResponse {
  return {
    timestamp: '2026-03-21T09:00:00Z',
    system: { status: 'healthy', activePipelines: 2 },
    agents: {
      'back-1': { eventsInPeriod: 42 },
      'qa': { eventsInPeriod: 15 },
      'pm': { eventsInPeriod: 0 },
    },
    pipeline: {
      activeTasks: 2,
      stageDistribution: { IMPLEMENTATION: 1, QA: 1, DONE: 3 },
    },
    costs: { totalTokens: 250_000, byAgent: {} },
    budget: {
      globalConsumedUsd: 3.50,
      globalLimitUsd: 10.00,
      globalConsumedTokens: 15000,
      globalLimitTokens: 50000,
    },
    lastRefresh: null,
    ...overrides,
  };
}

function makeTimeline(overrides?: Partial<ApiTimelineResponse>): ApiTimelineResponse {
  return {
    timestamp: '2026-03-21T09:00:00Z',
    activeTasks: 2,
    timelines: [
      {
        taskId: 'task-0001-abcdef',
        title: 'Implement user authentication flow',
        currentStage: 'IMPLEMENTATION',
        stages: [],
        totalDurationMs: 3600000,
      },
      {
        taskId: 'task-0002-ghijkl',
        title: 'Fix login page styling',
        currentStage: 'DONE',
        stages: [],
        totalDurationMs: 1800000,
      },
    ],
    ...overrides,
  };
}

function mockDataSource(
  metrics?: ApiMetricsResponse,
  timeline?: ApiTimelineResponse,
): StandupDataSource {
  return {
    getMetrics: vi.fn().mockResolvedValue(metrics ?? makeMetrics()),
    getTimeline: vi.fn().mockResolvedValue(timeline ?? makeTimeline()),
  };
}

function mockLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

// ── formatStandupSummary ──

describe('formatStandupSummary', () => {
  it('includes header and date', () => {
    const msg = formatStandupSummary(makeMetrics(), makeTimeline());
    expect(msg).toContain('Daily Standup Summary');
    expect(msg).toMatch(/\d{4}\\-\d{2}\\-\d{2}/);
  });

  it('shows system status', () => {
    const msg = formatStandupSummary(makeMetrics(), makeTimeline());
    expect(msg).toContain('healthy');
  });

  it('shows pipeline counts', () => {
    const msg = formatStandupSummary(makeMetrics(), makeTimeline());
    expect(msg).toContain('Active: 1');
    expect(msg).toContain('Completed: 1');
  });

  it('shows possibly stuck pipelines when in gated stages', () => {
    const tl = makeTimeline({
      timelines: [
        { taskId: 't1', title: 'T1', currentStage: 'IMPLEMENTATION', stages: [], totalDurationMs: null },
        { taskId: 't2', title: 'T2', currentStage: 'QA', stages: [], totalDurationMs: null },
      ],
    });
    const msg = formatStandupSummary(makeMetrics(), tl);
    expect(msg).toContain('Possibly stuck: 2');
  });

  it('omits stuck section when no pipelines in gated stages', () => {
    const tl = makeTimeline({
      timelines: [
        { taskId: 't1', title: 'T1', currentStage: 'IDEA', stages: [], totalDurationMs: null },
      ],
    });
    const msg = formatStandupSummary(makeMetrics(), tl);
    expect(msg).not.toContain('stuck');
  });

  it('shows stage distribution', () => {
    const msg = formatStandupSummary(makeMetrics(), makeTimeline());
    expect(msg).toContain('IMPLEMENTATION');
    expect(msg).toContain('QA');
  });

  it('omits zero-count stages from distribution', () => {
    const m = makeMetrics({
      pipeline: { activeTasks: 1, stageDistribution: { DESIGN: 0, QA: 1 } },
    });
    const msg = formatStandupSummary(m, makeTimeline());
    expect(msg).not.toContain('DESIGN');
    expect(msg).toContain('QA');
  });

  it('shows agent activity sorted by events', () => {
    const msg = formatStandupSummary(makeMetrics(), makeTimeline());
    const backIdx = msg.indexOf('back-1');
    const qaIdx = msg.indexOf('qa');
    expect(backIdx).toBeLessThan(qaIdx);
    expect(msg).toContain('42 events');
    expect(msg).toContain('15 events');
  });

  it('omits idle agents', () => {
    const msg = formatStandupSummary(makeMetrics(), makeTimeline());
    // pm has 0 events - should not appear in activity section
    const lines = msg.split('\n');
    const agentSection = lines.filter(l => l.includes('events'));
    expect(agentSection.every(l => !l.includes('pm'))).toBe(true);
  });

  it('shows active task details', () => {
    const msg = formatStandupSummary(makeMetrics(), makeTimeline());
    expect(msg).toContain('Active Tasks');
    expect(msg).toContain('Implement user authentication');
  });

  it('truncates long task titles', () => {
    const tl = makeTimeline({
      timelines: [
        {
          taskId: 't1',
          title: 'A'.repeat(50),
          currentStage: 'DESIGN',
          stages: [],
          totalDurationMs: null,
        },
      ],
    });
    const msg = formatStandupSummary(makeMetrics(), tl);
    expect(msg).toContain('\\.\\.\\.');
  });

  it('limits active tasks to 5 with overflow message', () => {
    const timelines = Array.from({ length: 7 }, (_, i) => ({
      taskId: `t${i}`,
      title: `Task ${i}`,
      currentStage: 'DESIGN',
      stages: [] as never[],
      totalDurationMs: null,
    }));
    const tl = makeTimeline({ timelines });
    const msg = formatStandupSummary(makeMetrics(), tl);
    expect(msg).toContain('and 2 more');
  });

  it('shows budget with green indicator when low usage', () => {
    const msg = formatStandupSummary(makeMetrics(), makeTimeline());
    expect(msg).toContain('🟢');
    expect(msg).toContain('35%');
  });

  it('shows budget with yellow indicator at 70%+', () => {
    const m = makeMetrics({
      budget: { globalConsumedUsd: 7.5, globalLimitUsd: 10, globalConsumedTokens: 0, globalLimitTokens: 0 },
    });
    const msg = formatStandupSummary(m, makeTimeline());
    expect(msg).toContain('🟡');
  });

  it('shows budget with red indicator at 90%+', () => {
    const m = makeMetrics({
      budget: { globalConsumedUsd: 9.5, globalLimitUsd: 10, globalConsumedTokens: 0, globalLimitTokens: 0 },
    });
    const msg = formatStandupSummary(m, makeTimeline());
    expect(msg).toContain('🔴');
  });

  it('omits budget when limit is 0', () => {
    const m = makeMetrics({
      budget: { globalConsumedUsd: 0, globalLimitUsd: 0, globalConsumedTokens: 0, globalLimitTokens: 0 },
    });
    const msg = formatStandupSummary(m, makeTimeline());
    expect(msg).not.toContain('Budget');
  });

  it('formats tokens in K for thousands', () => {
    const msg = formatStandupSummary(makeMetrics(), makeTimeline());
    expect(msg).toContain('250K');
  });

  it('formats tokens in M for millions', () => {
    const m = makeMetrics({ costs: { totalTokens: 2_500_000, byAgent: {} } });
    const msg = formatStandupSummary(m, makeTimeline());
    expect(msg).toContain('2\\.5M');
  });

  it('handles empty timelines gracefully', () => {
    const tl = makeTimeline({ timelines: [] });
    const msg = formatStandupSummary(makeMetrics(), tl);
    expect(msg).toContain('Active: 0');
    expect(msg).toContain('Completed: 0');
  });
});

// ── StandupScheduler ──

describe('StandupScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not start when disabled', () => {
    const ds = mockDataSource();
    const enqueue = vi.fn();
    const scheduler = new StandupScheduler(ds, enqueue, mockLogger(), { enabled: false });
    scheduler.start();
    expect(scheduler.running).toBe(false);
    scheduler.stop();
  });

  it('starts and stops cleanly', () => {
    const ds = mockDataSource();
    const enqueue = vi.fn();
    const scheduler = new StandupScheduler(ds, enqueue, mockLogger(), { enabled: true });
    scheduler.start();
    expect(scheduler.running).toBe(true);
    scheduler.stop();
    expect(scheduler.running).toBe(false);
  });

  it('posts standup when check is called at the right hour', async () => {
    const ds = mockDataSource();
    const enqueue = vi.fn();
    const scheduler = new StandupScheduler(ds, enqueue, mockLogger(), { enabled: true, hourUtc: 9 });

    const now = new Date('2026-03-21T09:30:00Z');
    const posted = await scheduler.check(now);

    expect(posted).toBe(true);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0][1]).toBe('normal');
    expect(ds.getMetrics).toHaveBeenCalledWith('day');
  });

  it('does not post before the configured hour', async () => {
    const ds = mockDataSource();
    const enqueue = vi.fn();
    const scheduler = new StandupScheduler(ds, enqueue, mockLogger(), { enabled: true, hourUtc: 9 });

    const now = new Date('2026-03-21T08:59:00Z');
    const posted = await scheduler.check(now);

    expect(posted).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not post twice on the same day', async () => {
    const ds = mockDataSource();
    const enqueue = vi.fn();
    const scheduler = new StandupScheduler(ds, enqueue, mockLogger(), { enabled: true, hourUtc: 9 });

    const morning = new Date('2026-03-21T09:00:00Z');
    const afternoon = new Date('2026-03-21T15:00:00Z');

    await scheduler.check(morning);
    await scheduler.check(afternoon);

    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('posts again on a new day', async () => {
    const ds = mockDataSource();
    const enqueue = vi.fn();
    const scheduler = new StandupScheduler(ds, enqueue, mockLogger(), { enabled: true, hourUtc: 9 });

    await scheduler.check(new Date('2026-03-21T09:00:00Z'));
    await scheduler.check(new Date('2026-03-22T09:00:00Z'));

    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('handles API errors gracefully', async () => {
    const ds = mockDataSource();
    (ds.getMetrics as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout'));
    const enqueue = vi.fn();
    const logger = mockLogger();
    const scheduler = new StandupScheduler(ds, enqueue, logger, { enabled: true, hourUtc: 9 });

    const posted = await scheduler.check(new Date('2026-03-21T09:00:00Z'));

    expect(posted).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
  });

  it('retries after API failure on same day', async () => {
    const ds = mockDataSource();
    const getMetricsFn = ds.getMetrics as ReturnType<typeof vi.fn>;
    getMetricsFn.mockRejectedValueOnce(new Error('fail'));
    const enqueue = vi.fn();
    const scheduler = new StandupScheduler(ds, enqueue, mockLogger(), { enabled: true, hourUtc: 9 });

    // First attempt fails
    await scheduler.check(new Date('2026-03-21T09:00:00Z'));
    expect(enqueue).not.toHaveBeenCalled();

    // Second attempt succeeds (same day)
    getMetricsFn.mockResolvedValue(makeMetrics());
    await scheduler.check(new Date('2026-03-21T09:15:00Z'));
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('uses default config when none provided', () => {
    const ds = mockDataSource();
    const scheduler = new StandupScheduler(ds, vi.fn(), mockLogger());
    scheduler.start();
    expect(scheduler.running).toBe(true);
    scheduler.stop();
  });

  it('logs disabled message when not enabled', () => {
    const ds = mockDataSource();
    const logger = mockLogger();
    const scheduler = new StandupScheduler(ds, vi.fn(), logger, { enabled: false });
    scheduler.start();
    expect(logger.info).toHaveBeenCalledWith('Standup scheduler disabled');
  });
});
