/**
 * Metrics Aggregation Engine (EP14, Task 0099)
 *
 * Computes aggregated metrics from the event_log table using pure SQL queries.
 * Supports incremental refresh and cron-based scheduling.
 */

import type Database from 'better-sqlite3';
import type { SqliteMetricsRepository } from './metrics-repository.js';
import type { MetricPeriod, RefreshResult } from './metrics-types.js';

export interface MetricsAggregatorDeps {
  readonly db: Database.Database;
  readonly metricsRepo: SqliteMetricsRepository;
  readonly generateId: () => string;
  readonly now: () => string;
}

export class MetricsAggregator {
  private hourlyTimer: ReturnType<typeof setInterval> | null = null;
  private dailyTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: MetricsAggregatorDeps) {}

  startCron(): void {
    // Refresh hourly metrics every 5 minutes
    this.hourlyTimer = setInterval(() => {
      try {
        this.refresh('hour');
      } catch {
        // best-effort cron; errors are logged by caller
      }
    }, 5 * 60 * 1000);

    // Refresh daily metrics every 60 minutes
    this.dailyTimer = setInterval(() => {
      try {
        this.refresh('day');
      } catch {
        // best-effort cron
      }
    }, 60 * 60 * 1000);

    // Unref timers so they don't keep the process alive
    if (this.hourlyTimer && typeof this.hourlyTimer === 'object' && 'unref' in this.hourlyTimer) {
      (this.hourlyTimer as NodeJS.Timeout).unref();
    }
    if (this.dailyTimer && typeof this.dailyTimer === 'object' && 'unref' in this.dailyTimer) {
      (this.dailyTimer as NodeJS.Timeout).unref();
    }
  }

  stopCron(): void {
    if (this.hourlyTimer) {
      clearInterval(this.hourlyTimer);
      this.hourlyTimer = null;
    }
    if (this.dailyTimer) {
      clearInterval(this.dailyTimer);
      this.dailyTimer = null;
    }
  }

  refresh(period: MetricPeriod = 'hour'): RefreshResult {
    const startMs = Date.now();
    const computedAt = this.deps.now();

    const since = this.computePeriodStart(period, computedAt);
    let metricsComputed = 0;

    metricsComputed += this.aggregateAgentActivity(since, period, computedAt);
    metricsComputed += this.aggregateEventTypeCounts(since, period, computedAt);
    metricsComputed += this.aggregatePipelineThroughput(since, period, computedAt);
    metricsComputed += this.aggregateCostSummary(since, period, computedAt);
    metricsComputed += this.aggregateStageDuration(since, period, computedAt);

    return {
      period,
      metricsComputed,
      durationMs: Date.now() - startMs,
      computedAt,
    };
  }

  // ── Private aggregation methods ─────────────────────────────────────

  private computePeriodStart(period: MetricPeriod, now: string): string {
    const d = new Date(now);
    if (period === 'hour') {
      d.setUTCMinutes(0, 0, 0);
    } else if (period === 'day') {
      d.setUTCHours(0, 0, 0, 0);
    } else {
      // 'all': go back to epoch
      return '1970-01-01T00:00:00.000Z';
    }
    return d.toISOString();
  }

  private aggregateAgentActivity(
    since: string,
    period: MetricPeriod,
    computedAt: string,
  ): number {
    const rows = this.deps.db
      .prepare(
        `SELECT COALESCE(agent_id, 'system') as agent, COUNT(*) as count
         FROM event_log
         WHERE created_at >= ?
         GROUP BY agent`,
      )
      .all(since) as Array<{ agent: string; count: number }>;

    if (rows.length === 0) return 0;

    const value: Record<string, number> = {};
    for (const row of rows) {
      value[row.agent] = row.count;
    }

    this.deps.metricsRepo.upsert({
      id: this.deps.generateId(),
      metricType: 'agent_activity',
      scope: 'system',
      period,
      periodStart: since,
      value,
      computedAt,
    });
    return 1;
  }

  private aggregateEventTypeCounts(
    since: string,
    period: MetricPeriod,
    computedAt: string,
  ): number {
    const rows = this.deps.db
      .prepare(
        `SELECT event_type, COUNT(*) as count
         FROM event_log
         WHERE created_at >= ?
         GROUP BY event_type`,
      )
      .all(since) as Array<{ event_type: string; count: number }>;

    if (rows.length === 0) return 0;

    const value: Record<string, number> = {};
    for (const row of rows) {
      value[row.event_type] = row.count;
    }

    this.deps.metricsRepo.upsert({
      id: this.deps.generateId(),
      metricType: 'event_type_count',
      scope: 'system',
      period,
      periodStart: since,
      value,
      computedAt,
    });
    return 1;
  }

  private aggregatePipelineThroughput(
    since: string,
    period: MetricPeriod,
    computedAt: string,
  ): number {
    const rows = this.deps.db
      .prepare(
        `SELECT json_extract(payload, '$.stage') as stage, COUNT(*) as count
         FROM event_log
         WHERE event_type = 'pipeline.stage.completed' AND created_at >= ?
         GROUP BY stage`,
      )
      .all(since) as Array<{ stage: string; count: number }>;

    if (rows.length === 0) return 0;

    const value: Record<string, number> = {};
    for (const row of rows) {
      if (row.stage) value[row.stage] = row.count;
    }

    this.deps.metricsRepo.upsert({
      id: this.deps.generateId(),
      metricType: 'pipeline_throughput',
      scope: 'system',
      period,
      periodStart: since,
      value,
      computedAt,
    });
    return 1;
  }

  private aggregateCostSummary(
    since: string,
    period: MetricPeriod,
    computedAt: string,
  ): number {
    const rows = this.deps.db
      .prepare(
        `SELECT
           COALESCE(agent_id, 'system') as agent,
           SUM(COALESCE(json_extract(payload, '$.inputTokens'), 0)) as input_tokens,
           SUM(COALESCE(json_extract(payload, '$.outputTokens'), 0)) as output_tokens,
           COUNT(*) as call_count
         FROM event_log
         WHERE event_type = 'cost.llm' AND created_at >= ?
         GROUP BY agent`,
      )
      .all(since) as Array<{
      agent: string;
      input_tokens: number;
      output_tokens: number;
      call_count: number;
    }>;

    if (rows.length === 0) return 0;

    let totalInput = 0;
    let totalOutput = 0;
    const byAgent: Record<string, { inputTokens: number; outputTokens: number; calls: number }> = {};

    for (const row of rows) {
      totalInput += row.input_tokens;
      totalOutput += row.output_tokens;
      byAgent[row.agent] = {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        calls: row.call_count,
      };
    }

    this.deps.metricsRepo.upsert({
      id: this.deps.generateId(),
      metricType: 'cost_summary',
      scope: 'system',
      period,
      periodStart: since,
      value: {
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalTokens: totalInput + totalOutput,
        byAgent,
      },
      computedAt,
    });
    return 1;
  }

  private aggregateStageDuration(
    since: string,
    period: MetricPeriod,
    computedAt: string,
  ): number {
    const rows = this.deps.db
      .prepare(
        `SELECT
           json_extract(payload, '$.stage') as stage,
           AVG(CAST(json_extract(payload, '$.durationMs') AS REAL)) as avg_duration_ms,
           COUNT(*) as count
         FROM event_log
         WHERE event_type = 'pipeline.stage.completed' AND created_at >= ?
           AND json_extract(payload, '$.durationMs') IS NOT NULL
         GROUP BY stage`,
      )
      .all(since) as Array<{
      stage: string;
      avg_duration_ms: number;
      count: number;
    }>;

    if (rows.length === 0) return 0;

    const value: Record<string, { avgDurationMs: number; count: number }> = {};
    for (const row of rows) {
      if (row.stage) {
        value[row.stage] = {
          avgDurationMs: Math.round(row.avg_duration_ms),
          count: row.count,
        };
      }
    }

    this.deps.metricsRepo.upsert({
      id: this.deps.generateId(),
      metricType: 'stage_duration',
      scope: 'system',
      period,
      periodStart: since,
      value,
      computedAt,
    });
    return 1;
  }
}
