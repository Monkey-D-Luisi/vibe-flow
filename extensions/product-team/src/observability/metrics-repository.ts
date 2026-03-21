/**
 * Metrics Repository (EP14, Task 0099)
 *
 * SQLite-backed CRUD for the metrics_aggregated table.
 * Follows the SqliteBudgetRepository pattern.
 */

import type Database from 'better-sqlite3';
import type { AggregatedMetric, MetricType, MetricPeriod, MetricRow } from './metrics-types.js';
import { rowToMetric } from './metrics-types.js';

export class SqliteMetricsRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(metric: AggregatedMetric): void {
    this.db
      .prepare(
        `INSERT INTO metrics_aggregated
           (id, metric_type, scope, period, period_start, value_json, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(metric_type, scope, period, period_start)
         DO UPDATE SET value_json = excluded.value_json,
                       computed_at = excluded.computed_at`,
      )
      .run(
        metric.id,
        metric.metricType,
        metric.scope,
        metric.period,
        metric.periodStart,
        JSON.stringify(metric.value),
        metric.computedAt,
      );
  }

  getByType(
    metricType: MetricType,
    scope?: string,
    period?: MetricPeriod,
  ): AggregatedMetric[] {
    let sql = 'SELECT * FROM metrics_aggregated WHERE metric_type = ?';
    const params: unknown[] = [metricType];

    if (scope !== undefined) {
      sql += ' AND scope = ?';
      params.push(scope);
    }
    if (period !== undefined) {
      sql += ' AND period = ?';
      params.push(period);
    }

    sql += ' ORDER BY period_start DESC';

    const rows = this.db.prepare(sql).all(...params) as MetricRow[];
    return rows.map(rowToMetric);
  }

  getLatest(
    metricType: MetricType,
    scope: string,
  ): AggregatedMetric | null {
    const row = this.db
      .prepare(
        `SELECT * FROM metrics_aggregated
         WHERE metric_type = ? AND scope = ?
         ORDER BY computed_at DESC LIMIT 1`,
      )
      .get(metricType, scope) as MetricRow | undefined;
    return row ? rowToMetric(row) : null;
  }

  getLastComputedAt(): string | null {
    const row = this.db
      .prepare('SELECT MAX(computed_at) as last FROM metrics_aggregated')
      .get() as { last: string | null } | undefined;
    return row?.last ?? null;
  }

  deleteOlderThan(cutoff: string): number {
    const result = this.db
      .prepare('DELETE FROM metrics_aggregated WHERE computed_at < ?')
      .run(cutoff);
    return result.changes;
  }
}
