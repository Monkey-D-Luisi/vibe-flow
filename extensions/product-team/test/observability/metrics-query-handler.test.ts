import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createTestDatabase } from '../helpers.js';
import { SqliteMetricsRepository } from '../../src/observability/metrics-repository.js';
import { createMetricsQueryHandler, type MetricsQueryDeps } from '../../src/observability/metrics-query-handler.js';

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

describe('metrics-query-handler', () => {
  let db: Database.Database;
  let metricsRepo: SqliteMetricsRepository;
  let idCounter = 0;

  function createDeps(overrides?: Partial<MetricsQueryDeps>): MetricsQueryDeps {
    return {
      db,
      metricsRepo,
      now: () => TEST_NOW,
      ...overrides,
    };
  }

  beforeEach(() => {
    db = createTestDatabase();
    metricsRepo = new SqliteMetricsRepository(db);
    idCounter = 0;
  });

  afterEach(() => {
    db?.close();
  });

  function nextId(): string {
    return `id-${String(++idCounter).padStart(4, '0')}`;
  }

  // ── Basic response structure ──────────────────────────────────

  it('returns 200 with complete JSON structure on empty database', () => {
    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(200);
    const body = parseBody(res);
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('system');
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('pipeline');
    expect(body).toHaveProperty('costs');
    expect(body).toHaveProperty('budget');
    expect(body).toHaveProperty('lastRefresh');
  });

  it('returns healthy system status on empty database', () => {
    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const system = body['system'] as Record<string, unknown>;
    expect(system['status']).toBe('healthy');
    expect(system['activePipelines']).toBe(0);
  });

  // ── Period parameter ──────────────────────────────────────────

  it('defaults to hour period when no parameter given', () => {
    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(200);
  });

  it('accepts explicit period parameter', () => {
    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics?period=day');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(200);
  });

  it('rejects invalid period parameter', () => {
    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics?period=invalid');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(400);
    const body = parseBody(res);
    expect(body['error']).toContain('period');
  });

  // ── Agent activity from aggregated metrics ─────────────────────

  it('returns agent activity from pre-aggregated metrics', () => {
    metricsRepo.upsert({
      id: nextId(),
      metricType: 'agent_activity',
      scope: 'system',
      period: 'hour',
      periodStart: '2026-03-21T10:00:00.000Z',
      value: { pm: 15, qa: 8 },
      computedAt: TEST_NOW,
    });

    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics?period=hour');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const agents = body['agents'] as Record<string, unknown>;
    expect(agents['pm']).toEqual({ eventsInPeriod: 15 });
    expect(agents['qa']).toEqual({ eventsInPeriod: 8 });
  });

  // ── Pipeline data ─────────────────────────────────────────────

  it('returns pipeline stage distribution from aggregated metrics', () => {
    metricsRepo.upsert({
      id: nextId(),
      metricType: 'pipeline_throughput',
      scope: 'system',
      period: 'hour',
      periodStart: '2026-03-21T10:00:00.000Z',
      value: { IMPLEMENTATION: 3, QA: 1 },
      computedAt: TEST_NOW,
    });

    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics?period=hour');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const pipeline = body['pipeline'] as Record<string, unknown>;
    expect(pipeline['stageDistribution']).toEqual({ IMPLEMENTATION: 3, QA: 1 });
  });

  it('returns active pipeline count from orchestrator_state', () => {
    // Seed a task with an active pipeline
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at)
       VALUES ('t1', 'test task', 'in_progress', 'minor', ?, ?)`,
    ).run(TEST_NOW, TEST_NOW);
    db.prepare(
      `INSERT INTO orchestrator_state (task_id, current, previous, last_agent, rounds_review, rev, updated_at)
       VALUES ('t1', 'IMPLEMENTATION', NULL, 'pm', 0, 0, ?)`,
    ).run(TEST_NOW);

    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const system = body['system'] as Record<string, unknown>;
    expect(system['activePipelines']).toBe(1);
    const pipeline = body['pipeline'] as Record<string, unknown>;
    expect(pipeline['activeTasks']).toBe(1);
  });

  // ── Cost summary ──────────────────────────────────────────────

  it('returns cost data from aggregated metrics', () => {
    metricsRepo.upsert({
      id: nextId(),
      metricType: 'cost_summary',
      scope: 'system',
      period: 'hour',
      periodStart: '2026-03-21T10:00:00.000Z',
      value: {
        totalInputTokens: 30000,
        totalOutputTokens: 20000,
        totalTokens: 50000,
        byAgent: { pm: { inputTokens: 20000, outputTokens: 10000, calls: 5 } },
      },
      computedAt: TEST_NOW,
    });

    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics?period=hour');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const costs = body['costs'] as Record<string, unknown>;
    expect(costs['totalTokens']).toBe(50000);
    const byAgent = costs['byAgent'] as Record<string, unknown>;
    expect(byAgent).toHaveProperty('pm');
  });

  // ── Budget data from budget_records ────────────────────────────

  it('returns budget data from budget_records table', () => {
    db.prepare(
      `INSERT INTO budget_records
         (id, scope, scope_id, limit_tokens, limit_usd, consumed_tokens, consumed_usd, rev, created_at, updated_at)
       VALUES ('b1', 'global', 'global', 1000000, 10.0, 312000, 3.12, 1, ?, ?)`,
    ).run(TEST_NOW, TEST_NOW);

    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const budget = body['budget'] as Record<string, unknown>;
    expect(budget['globalConsumedUsd']).toBe(3.12);
    expect(budget['globalLimitUsd']).toBe(10.0);
    expect(budget['globalConsumedTokens']).toBe(312000);
    expect(budget['globalLimitTokens']).toBe(1000000);
  });

  // ── Last refresh timestamp ─────────────────────────────────────

  it('returns lastRefresh from most recent metric', () => {
    metricsRepo.upsert({
      id: nextId(),
      metricType: 'agent_activity',
      scope: 'system',
      period: 'hour',
      periodStart: '2026-03-21T10:00:00.000Z',
      value: { pm: 5 },
      computedAt: '2026-03-21T10:25:00.000Z',
    });

    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    expect(body['lastRefresh']).toBe('2026-03-21T10:25:00.000Z');
  });

  it('returns null lastRefresh when no metrics exist', () => {
    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    expect(body['lastRefresh']).toBeNull();
  });

  // ── Fallback: live queries when aggregated is empty ────────────

  it('falls back to live agent activity query when no aggregated data', () => {
    // Seed event_log directly (no aggregated metrics)
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at)
       VALUES ('t1', 'test', 'in_progress', 'minor', ?, ?)`,
    ).run(TEST_NOW, TEST_NOW);
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e1', 't1', 'task.created', 'pm', '{}', ?)`,
    ).run(TEST_NOW);
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e2', 't1', 'task.updated', 'pm', '{}', ?)`,
    ).run(TEST_NOW);

    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const agents = body['agents'] as Record<string, unknown>;
    const pmData = agents['pm'] as Record<string, unknown>;
    expect(pmData['eventsInPeriod']).toBe(2);
  });

  // ── 404 for wrong method ───────────────────────────────────────

  it('returns 404 for non-GET requests', () => {
    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics', 'POST');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(404);
  });

  // ── Multiple periods ───────────────────────────────────────────

  it('returns data for day period', () => {
    metricsRepo.upsert({
      id: nextId(),
      metricType: 'agent_activity',
      scope: 'system',
      period: 'day',
      periodStart: '2026-03-21T00:00:00.000Z',
      value: { pm: 100, qa: 50 },
      computedAt: TEST_NOW,
    });

    const handler = createMetricsQueryHandler(createDeps());
    const req = createMockReq('/api/metrics?period=day');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    const agents = body['agents'] as Record<string, unknown>;
    expect(agents['pm']).toEqual({ eventsInPeriod: 100 });
  });
});
