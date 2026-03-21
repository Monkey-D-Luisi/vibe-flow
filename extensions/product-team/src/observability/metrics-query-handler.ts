/**
 * Metrics Query HTTP Handler (EP14, Task 0100)
 *
 * GET /api/metrics -- returns a structured health/metrics summary JSON.
 * Data sourced from pre-aggregated metrics (metrics_aggregated) with
 * fallback to live SQL queries when aggregated data is empty.
 * Follows the budget-query-handler.ts pattern.
 */

import type Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { SqliteMetricsRepository } from './metrics-repository.js';
import type { MetricPeriod } from './metrics-types.js';
import { METRIC_PERIODS } from './metrics-types.js';

export interface MetricsQueryDeps {
  readonly db: Database.Database;
  readonly metricsRepo: SqliteMetricsRepository;
  readonly now: () => string;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function createMetricsQueryHandler(
  deps: MetricsQueryDeps,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const baseUrl = `http://localhost${req.url ?? '/'}`;
    const url = new URL(baseUrl);

    if (req.method !== 'GET') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const periodParam = url.searchParams.get('period') ?? 'hour';
    if (!METRIC_PERIODS.includes(periodParam as MetricPeriod)) {
      sendJson(res, 400, { error: `Invalid period: ${periodParam}. Must be one of: ${METRIC_PERIODS.join(', ')}` });
      return;
    }
    const period = periodParam as MetricPeriod;

    const timestamp = deps.now();

    // System: active pipelines
    const activePipelines = getActivePipelineCount(deps.db);

    // Agent activity: try aggregated first, fallback to live
    const agents = getAgentActivity(deps, period);

    // Pipeline: stage distribution + active task count
    const pipeline = getPipelineData(deps, period, activePipelines);

    // Cost summary
    const costs = getCostSummary(deps, period);

    // Budget from budget_records
    const budget = getBudgetData(deps.db);

    // Last refresh timestamp
    const lastRefresh = deps.metricsRepo.getLastComputedAt();

    sendJson(res, 200, {
      timestamp,
      system: { status: 'healthy', activePipelines },
      agents,
      pipeline,
      costs,
      budget,
      lastRefresh,
    });
  };
}

// ── Data assembly helpers ─────────────────────────────────────────

function getActivePipelineCount(db: Database.Database): number {
  // task_records.pipeline_stage holds the 10-stage pipeline position (e.g. IMPLEMENTATION, QA, DONE).
  // A task has an active pipeline when pipeline_stage is set and not 'DONE'.
  const row = db
    .prepare(
      "SELECT COUNT(*) as c FROM task_records WHERE pipeline_stage IS NOT NULL AND pipeline_stage <> 'DONE'",
    )
    .get() as { c: number } | undefined;
  return row?.c ?? 0;
}

function getAgentActivity(
  deps: MetricsQueryDeps,
  period: MetricPeriod,
): Record<string, { eventsInPeriod: number }> {
  // Try aggregated data first
  const metrics = deps.metricsRepo.getByType('agent_activity', 'system', period);
  if (metrics.length > 0) {
    const latest = metrics[0]; // ordered by period_start DESC
    const result: Record<string, { eventsInPeriod: number }> = {};
    for (const [agent, count] of Object.entries(latest.value)) {
      if (typeof count === 'number') {
        result[agent] = { eventsInPeriod: count };
      }
    }
    return result;
  }

  // Fallback: live query from event_log
  const since = computePeriodStart(period, deps.now());
  const rows = deps.db
    .prepare(
      `SELECT COALESCE(agent_id, 'system') as agent, COUNT(*) as count
       FROM event_log WHERE created_at >= ?
       GROUP BY agent`,
    )
    .all(since) as Array<{ agent: string; count: number }>;

  const result: Record<string, { eventsInPeriod: number }> = {};
  for (const row of rows) {
    result[row.agent] = { eventsInPeriod: row.count };
  }
  return result;
}

function getPipelineData(
  deps: MetricsQueryDeps,
  period: MetricPeriod,
  activePipelines: number,
): { activeTasks: number; stageDistribution: Record<string, number> } {
  // Stage distribution from aggregated metrics
  const metrics = deps.metricsRepo.getByType('pipeline_throughput', 'system', period);
  const stageDistribution: Record<string, number> = {};
  if (metrics.length > 0) {
    const latest = metrics[0];
    for (const [stage, count] of Object.entries(latest.value)) {
      if (typeof count === 'number') {
        stageDistribution[stage] = count;
      }
    }
  }

  return { activeTasks: activePipelines, stageDistribution };
}

function getCostSummary(
  deps: MetricsQueryDeps,
  period: MetricPeriod,
): { totalTokens: number; byAgent: Record<string, unknown> } {
  const metrics = deps.metricsRepo.getByType('cost_summary', 'system', period);
  if (metrics.length > 0) {
    const latest = metrics[0];
    const totalTokens = typeof latest.value['totalTokens'] === 'number'
      ? latest.value['totalTokens']
      : 0;
    const byAgent = typeof latest.value['byAgent'] === 'object' && latest.value['byAgent'] !== null
      ? latest.value['byAgent'] as Record<string, unknown>
      : {};
    return { totalTokens, byAgent };
  }

  // Fallback: live query from event_log for cost.llm events
  const since = computePeriodStart(period, deps.now());
  const rows = deps.db
    .prepare(
      `SELECT COALESCE(agent_id, 'system') as agent,
              SUM(COALESCE(json_extract(payload, '$.totalTokens'), 0)) as tokens
       FROM event_log
       WHERE event_type = 'cost.llm' AND created_at >= ?
       GROUP BY agent`,
    )
    .all(since) as Array<{ agent: string; tokens: number }>;

  let totalTokens = 0;
  const byAgent: Record<string, unknown> = {};
  for (const row of rows) {
    totalTokens += row.tokens;
    byAgent[row.agent] = { tokens: row.tokens };
  }
  return { totalTokens, byAgent };
}

function getBudgetData(db: Database.Database): {
  globalConsumedUsd: number;
  globalLimitUsd: number;
  globalConsumedTokens: number;
  globalLimitTokens: number;
} {
  const row = db
    .prepare(
      "SELECT limit_tokens, limit_usd, consumed_tokens, consumed_usd FROM budget_records WHERE scope = 'global' AND scope_id = 'global' LIMIT 1",
    )
    .get() as {
    limit_tokens: number;
    limit_usd: number;
    consumed_tokens: number;
    consumed_usd: number;
  } | undefined;

  if (!row) {
    return { globalConsumedUsd: 0, globalLimitUsd: 0, globalConsumedTokens: 0, globalLimitTokens: 0 };
  }

  return {
    globalConsumedUsd: row.consumed_usd,
    globalLimitUsd: row.limit_usd,
    globalConsumedTokens: row.consumed_tokens,
    globalLimitTokens: row.limit_tokens,
  };
}

function computePeriodStart(period: MetricPeriod, now: string): string {
  const d = new Date(now);
  if (period === 'hour') {
    d.setUTCMinutes(0, 0, 0);
  } else if (period === 'day') {
    d.setUTCHours(0, 0, 0, 0);
  } else {
    return '1970-01-01T00:00:00.000Z';
  }
  return d.toISOString();
}
