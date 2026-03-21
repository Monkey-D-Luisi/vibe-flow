import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createTestDatabase } from '../helpers.js';
import { createTimelineQueryHandler, type TimelineQueryDeps } from '../../src/observability/timeline-query-handler.js';

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

describe('timeline-query-handler', () => {
  let db: Database.Database;

  function createDeps(): TimelineQueryDeps {
    return { db, now: () => TEST_NOW };
  }

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db?.close();
  });

  // ── List active timelines ──────────────────────────────────────

  it('returns empty list when no pipeline tasks exist', () => {
    const handler = createTimelineQueryHandler(createDeps());
    const req = createMockReq('/api/timeline');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(200);
    const body = parseBody(res);
    expect(body['activeTasks']).toBe(0);
    expect(body['timelines']).toEqual([]);
  });

  it('returns active pipeline tasks with their timelines', () => {
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at)
       VALUES ('t1', 'Feature X', 'in_progress', 'minor', ?, ?)`,
    ).run(TEST_NOW, TEST_NOW);
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at) VALUES
       ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"ROADMAP"}', '2026-03-21T09:00:00.000Z'),
       ('e2', 't1', 'pipeline.stage.completed', 'pm', '{"stage":"ROADMAP","durationMs":1800000}', '2026-03-21T09:30:00.000Z'),
       ('e3', 't1', 'pipeline.stage.entered', 'back-1', '{"stage":"IMPLEMENTATION"}', '2026-03-21T09:30:00.000Z')`,
    ).run();

    const handler = createTimelineQueryHandler(createDeps());
    const req = createMockReq('/api/timeline');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    expect(body['activeTasks']).toBe(1);
    const timelines = body['timelines'] as Array<Record<string, unknown>>;
    expect(timelines[0]['taskId']).toBe('t1');
    expect(timelines[0]['title']).toBe('Feature X');
    expect(timelines[0]['currentStage']).toBe('IMPLEMENTATION');
    const stages = timelines[0]['stages'] as Array<Record<string, unknown>>;
    expect(stages).toHaveLength(2);
  });

  // ── Single task timeline ──────────────────────────────────────

  it('returns timeline for specific taskId', () => {
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at)
       VALUES ('t1', 'Feature Y', 'in_progress', 'minor', ?, ?)`,
    ).run(TEST_NOW, TEST_NOW);
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"QA"}', ?)`,
    ).run(TEST_NOW);

    const handler = createTimelineQueryHandler(createDeps());
    const req = createMockReq('/api/timeline?taskId=t1');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(200);
    const body = parseBody(res);
    expect(body['taskId']).toBe('t1');
    expect(body['title']).toBe('Feature Y');
    expect(body['currentStage']).toBe('QA');
  });

  it('returns 404 for non-existent taskId', () => {
    const handler = createTimelineQueryHandler(createDeps());
    const req = createMockReq('/api/timeline?taskId=nonexistent');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(404);
    const body = parseBody(res);
    expect(body['error']).toContain('not found');
  });

  // ── Method validation ─────────────────────────────────────────

  it('returns 404 for POST requests', () => {
    const handler = createTimelineQueryHandler(createDeps());
    const req = createMockReq('/api/timeline', 'POST');
    const res = createMockRes();

    handler(req, res);

    expect(res._status).toBe(404);
  });

  // ── Edge cases ────────────────────────────────────────────────

  it('returns timestamp in response', () => {
    const handler = createTimelineQueryHandler(createDeps());
    const req = createMockReq('/api/timeline');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    expect(body['timestamp']).toBe(TEST_NOW);
  });

  it('excludes completed pipeline tasks from list view', () => {
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at) VALUES
       ('t1', 'Active', 'in_progress', 'minor', ?, ?),
       ('t2', 'Done', 'done', 'minor', ?, ?)`,
    ).run(TEST_NOW, TEST_NOW, TEST_NOW, TEST_NOW);
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at) VALUES
       ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"IMPLEMENTATION"}', ?),
       ('e2', 't2', 'pipeline.stage.entered', 'pm', '{"stage":"SHIPPING"}', ?),
       ('e3', 't2', 'pipeline.stage.entered', 'pm', '{"stage":"DONE"}', ?)`,
    ).run(TEST_NOW, TEST_NOW, TEST_NOW);

    const handler = createTimelineQueryHandler(createDeps());
    const req = createMockReq('/api/timeline');
    const res = createMockRes();

    handler(req, res);

    const body = parseBody(res);
    expect(body['activeTasks']).toBe(1);
    const timelines = body['timelines'] as Array<Record<string, unknown>>;
    expect(timelines[0]['taskId']).toBe('t1');
  });
});
