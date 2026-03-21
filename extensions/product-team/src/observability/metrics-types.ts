/**
 * Metrics Aggregation Domain Types (EP14, Task 0099)
 *
 * Domain types and TypeBox schemas for the metrics aggregation engine.
 */

import { Type, type Static } from '@sinclair/typebox';

// ── Metric types ────────────────────────────────────────────────────────

export const METRIC_TYPES = [
  'agent_activity',
  'event_type_count',
  'pipeline_throughput',
  'cost_summary',
  'stage_duration',
] as const;

export type MetricType = (typeof METRIC_TYPES)[number];

export const METRIC_PERIODS = ['hour', 'day', 'all'] as const;

export type MetricPeriod = (typeof METRIC_PERIODS)[number];

// ── Domain interfaces ───────────────────────────────────────────────────

export interface AggregatedMetric {
  readonly id: string;
  readonly metricType: MetricType;
  readonly scope: string;
  readonly period: MetricPeriod;
  readonly periodStart: string;
  readonly value: Record<string, unknown>;
  readonly computedAt: string;
}

export interface RefreshResult {
  readonly period: MetricPeriod;
  readonly metricsComputed: number;
  readonly durationMs: number;
  readonly computedAt: string;
}

// ── TypeBox schemas for tool parameters ─────────────────────────────────

export const MetricsRefreshParams = Type.Object({
  period: Type.Optional(
    Type.Union([
      Type.Literal('hour'),
      Type.Literal('day'),
      Type.Literal('all'),
    ]),
  ),
});

export type MetricsRefreshInput = Static<typeof MetricsRefreshParams>;

// ── Database row type (internal) ────────────────────────────────────────

export interface MetricRow {
  readonly id: string;
  readonly metric_type: string;
  readonly scope: string;
  readonly period: string;
  readonly period_start: string;
  readonly value_json: string;
  readonly computed_at: string;
}

export function rowToMetric(row: MetricRow): AggregatedMetric {
  return {
    id: row.id,
    metricType: row.metric_type as MetricType,
    scope: row.scope,
    period: row.period as MetricPeriod,
    periodStart: row.period_start,
    value: JSON.parse(row.value_json) as Record<string, unknown>,
    computedAt: row.computed_at,
  };
}
