/**
 * Heatmap Query HTTP Handler (EP14, Task 0103)
 *
 * GET /api/metrics/heatmap -- returns time-bucketed agent activity data.
 * Uses SQL-based bucketing with strftime() for efficiency.
 *
 * Query params:
 *   ?bucketMinutes=15|30|60 (default 15)
 *   ?since=ISO8601 (default: 24h ago)
 *   ?until=ISO8601 (default: now)
 */

import type Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

export interface HeatmapQueryDeps {
  readonly db: Database.Database;
  readonly now: () => string;
}

const VALID_BUCKETS = new Set([15, 30, 60]);

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function createHeatmapQueryHandler(
  deps: HeatmapQueryDeps,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const baseUrl = `http://localhost${req.url ?? '/'}`;
    const url = new URL(baseUrl);

    // Parse bucket size
    const bucketParam = url.searchParams.get('bucketMinutes');
    const bucketMinutes = bucketParam ? parseInt(bucketParam, 10) : 15;
    if (!VALID_BUCKETS.has(bucketMinutes)) {
      sendJson(res, 400, {
        error: `Invalid bucketMinutes: ${bucketParam}. Must be one of: 15, 30, 60`,
      });
      return;
    }

    // Parse time range
    const nowStr = deps.now();
    const until = url.searchParams.get('until') ?? nowStr;
    const sinceDefault = new Date(new Date(nowStr).getTime() - 24 * 60 * 60 * 1000).toISOString();
    const since = url.searchParams.get('since') ?? sinceDefault;

    // SQL-based bucketing using strftime
    // Rounds minutes down to nearest bucket boundary
    const rows = deps.db
      .prepare(
        `SELECT
           COALESCE(agent_id, 'system') as agent,
           strftime('%Y-%m-%dT%H:', created_at) ||
             printf('%02d', (CAST(strftime('%M', created_at) AS INTEGER) / CAST(:bucket AS INTEGER)) * CAST(:bucket AS INTEGER)) ||
             ':00.000Z' as bucket_start,
           COUNT(*) as count
         FROM event_log
         WHERE created_at >= :since AND created_at <= :until
         GROUP BY agent, bucket_start
         ORDER BY bucket_start, agent`,
      )
      .all({ bucket: bucketMinutes, since, until }) as Array<{
      agent: string;
      bucket_start: string;
      count: number;
    }>;

    // Build response: agents list, bucket data, totals
    const agentSet = new Set<string>();
    const bucketMap = new Map<string, Record<string, number>>();
    const totals: Record<string, number> = {};

    for (const row of rows) {
      agentSet.add(row.agent);

      if (!bucketMap.has(row.bucket_start)) {
        bucketMap.set(row.bucket_start, {});
      }
      bucketMap.get(row.bucket_start)![row.agent] = row.count;

      totals[row.agent] = (totals[row.agent] ?? 0) + row.count;
    }

    const agents = Array.from(agentSet).sort();
    const buckets = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, counts]) => ({ start, counts }));

    sendJson(res, 200, {
      timestamp: nowStr,
      bucketMinutes,
      since,
      until,
      agents,
      buckets,
      totals,
    });
  };
}
