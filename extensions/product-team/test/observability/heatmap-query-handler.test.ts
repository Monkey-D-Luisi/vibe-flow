import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createTestDatabase } from '../helpers.js';
import { createHeatmapQueryHandler, type HeatmapQueryDeps } from '../../src/observability/heatmap-query-handler.js';

const TEST_NOW = '2026-03-21T10:30:00.000Z';

function createMockReq(url: string, method = 'GET'): IncomingMessage {
  return { url, method } as unknown as IncomingMessage;
}

function createMockRes(): ServerResponse & { _body: string; _status: number } {
  const res = {
    statusCode: 200,
    _body: '',
    _status: 200,
    setHeader: () => res,
    end: (body: string) => {
      res._body = body;
      res._status = res.statusCode;
    },
  };
  return res as unknown as ServerResponse & { _body: string; _status: number };
}

function parseBody(res: { _body: string }): Record<string, unknown> {
  return JSON.parse(res._body) as Record<string, unknown>;
}

describe('heatmap-query-handler', () => {
  let db: Database.Database;

  function createDeps(): HeatmapQueryDeps {
    return { db, now: () => TEST_NOW };
  }

  beforeEach(() => {
    db = createTestDatabase();
    // Seed a task for event_log FK
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at)
       VALUES ('t1', 'Test Task', 'in_progress', 'minor', ?, ?)`,
    ).run(TEST_NOW, TEST_NOW);
  });

  afterEach(() => {
    db?.close();
  });

  // ── Basic response structure ─────────────────────────────────

  it('returns 200 with empty heatmap on empty database', () => {
    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq('/api/metrics/heatmap');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(200);
    const body = parseBody(res);
    expect(body['agents']).toEqual([]);
    expect(body['buckets']).toEqual([]);
    expect(body['totals']).toEqual({});
    expect(body['bucketMinutes']).toBe(15);
  });

  // ── Bucket parameter validation ──────────────────────────────

  it('accepts bucketMinutes=30', () => {
    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq('/api/metrics/heatmap?bucketMinutes=30');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(200);
    const body = parseBody(res);
    expect(body['bucketMinutes']).toBe(30);
  });

  it('accepts bucketMinutes=60', () => {
    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq('/api/metrics/heatmap?bucketMinutes=60');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(200);
    const body = parseBody(res);
    expect(body['bucketMinutes']).toBe(60);
  });

  it('rejects invalid bucketMinutes', () => {
    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq('/api/metrics/heatmap?bucketMinutes=10');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(400);
    const body = parseBody(res);
    expect(body['error']).toContain('bucketMinutes');
  });

  // ── Bucketed data ────────────────────────────────────────────

  it('returns bucketed agent activity data', () => {
    // Seed events at different times within the same hour
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at) VALUES
       ('e1', 't1', 'task.created', 'pm', '{}', '2026-03-21T10:05:00.000Z'),
       ('e2', 't1', 'task.updated', 'pm', '{}', '2026-03-21T10:10:00.000Z'),
       ('e3', 't1', 'task.updated', 'qa', '{}', '2026-03-21T10:20:00.000Z')`,
    ).run();

    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq(
      '/api/metrics/heatmap?bucketMinutes=15&since=2026-03-21T10:00:00.000Z&until=2026-03-21T11:00:00.000Z',
    );
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    expect(res._status).toBe(200);

    const agents = body['agents'] as string[];
    expect(agents).toContain('pm');
    expect(agents).toContain('qa');

    const buckets = body['buckets'] as Array<{ start: string; counts: Record<string, number> }>;
    expect(buckets.length).toBeGreaterThan(0);

    // pm had 2 events in the 10:00 bucket (minutes 05 and 10 both round to 00)
    const bucket0 = buckets.find((b) => b.start === '2026-03-21T10:00:00.000Z');
    expect(bucket0).toBeDefined();
    expect(bucket0!.counts['pm']).toBe(2);

    // qa had 1 event in the 10:15 bucket (minute 20 rounds to 15)
    const bucket15 = buckets.find((b) => b.start === '2026-03-21T10:15:00.000Z');
    expect(bucket15).toBeDefined();
    expect(bucket15!.counts['qa']).toBe(1);

    const totals = body['totals'] as Record<string, number>;
    expect(totals['pm']).toBe(2);
    expect(totals['qa']).toBe(1);
  });

  it('groups events into 30-minute buckets', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at) VALUES
       ('e1', 't1', 'task.created', 'pm', '{}', '2026-03-21T10:05:00.000Z'),
       ('e2', 't1', 'task.updated', 'pm', '{}', '2026-03-21T10:25:00.000Z'),
       ('e3', 't1', 'task.updated', 'pm', '{}', '2026-03-21T10:35:00.000Z')`,
    ).run();

    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq(
      '/api/metrics/heatmap?bucketMinutes=30&since=2026-03-21T10:00:00.000Z&until=2026-03-21T11:00:00.000Z',
    );
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const buckets = body['buckets'] as Array<{ start: string; counts: Record<string, number> }>;

    // Minutes 5 and 25 -> bucket 00; minute 35 -> bucket 30
    const bucket0 = buckets.find((b) => b.start === '2026-03-21T10:00:00.000Z');
    const bucket30 = buckets.find((b) => b.start === '2026-03-21T10:30:00.000Z');

    expect(bucket0!.counts['pm']).toBe(2);
    expect(bucket30!.counts['pm']).toBe(1);
  });

  // ── Time range filtering ─────────────────────────────────────

  it('respects since/until parameters', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at) VALUES
       ('e1', 't1', 'task.created', 'pm', '{}', '2026-03-21T08:00:00.000Z'),
       ('e2', 't1', 'task.updated', 'pm', '{}', '2026-03-21T10:00:00.000Z'),
       ('e3', 't1', 'task.updated', 'pm', '{}', '2026-03-21T12:00:00.000Z')`,
    ).run();

    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq(
      '/api/metrics/heatmap?since=2026-03-21T09:00:00.000Z&until=2026-03-21T11:00:00.000Z',
    );
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const totals = body['totals'] as Record<string, number>;
    expect(totals['pm']).toBe(1); // only the 10:00 event is in range
  });

  // ── Method validation ────────────────────────────────────────

  it('returns 404 for POST requests', () => {
    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq('/api/metrics/heatmap', 'POST');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(404);
  });

  // ── Response metadata ────────────────────────────────────────

  it('includes timestamp and range in response', () => {
    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq('/api/metrics/heatmap');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    expect(body['timestamp']).toBe(TEST_NOW);
    expect(body).toHaveProperty('since');
    expect(body).toHaveProperty('until');
  });

  // ── Agents sorted alphabetically ────────────────────────────

  it('returns agents sorted alphabetically', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at) VALUES
       ('e1', 't1', 'task.created', 'qa', '{}', ?),
       ('e2', 't1', 'task.updated', 'back-1', '{}', ?),
       ('e3', 't1', 'task.updated', 'pm', '{}', ?)`,
    ).run(TEST_NOW, TEST_NOW, TEST_NOW);

    const handler = createHeatmapQueryHandler(createDeps());
    const req = createMockReq('/api/metrics/heatmap?since=2026-03-21T00:00:00.000Z');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const agents = body['agents'] as string[];
    expect(agents).toEqual(['back-1', 'pm', 'qa']);
  });
});
