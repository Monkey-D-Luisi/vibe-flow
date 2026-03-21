/**
 * Shared State API Tests
 *
 * Tests budget and decision HTTP query handlers with in-memory SQLite.
 * EP13 Task 0098
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { createTestDatabase } from '../helpers.js';
import { createBudgetQueryHandler, type BudgetQueryDeps } from '../../src/services/budget-query-handler.js';
import { createDecisionQueryHandler } from '../../src/services/decision-query-handler.js';

/** Create a mock IncomingMessage with given method, URL, and optional body. */
function mockRequest(method: string, url: string, body?: string): IncomingMessage {
  const stream = new PassThrough();
  if (body) {
    stream.end(Buffer.from(body, 'utf-8'));
  } else {
    stream.end();
  }
  Object.assign(stream, { method, url, headers: {} });
  return stream as unknown as IncomingMessage;
}

/** Capture a ServerResponse's output. */
function captureResponse(): { res: ServerResponse; getResult: () => { statusCode: number; body: string } } {
  const stream = new PassThrough();
  const res = stream as unknown as ServerResponse;
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];

  Object.defineProperty(res, 'statusCode', {
    get: () => statusCode,
    set: (v: number) => { statusCode = v; },
  });
  res.setHeader = (name: string, value: string | number) => {
    headers[String(name).toLowerCase()] = String(value);
    return res;
  };
  res.end = ((data?: unknown) => {
    if (data) chunks.push(Buffer.from(String(data), 'utf-8'));
    return res;
  }) as ServerResponse['end'];

  return {
    res,
    getResult: () => ({
      statusCode,
      body: Buffer.concat(chunks).toString('utf-8'),
    }),
  };
}

describe('budget query handler', () => {
  let budgetDeps: BudgetQueryDeps;
  const records = [
    { id: 'B1', scope: 'global', scopeId: 'default', limitTokens: 10000, consumedTokens: 2000, limitUsd: 5, consumedUsd: 1, status: 'active', warningThreshold: 0.8, rev: 1 },
    { id: 'B2', scope: 'global', scopeId: 'test', limitTokens: 5000, consumedTokens: 0, limitUsd: 2, consumedUsd: 0, status: 'active', warningThreshold: 0.8, rev: 1 },
  ];

  beforeEach(() => {
    budgetDeps = {
      getByScope: (scope, scopeId) => records.find((r) => r.scope === scope && r.scopeId === scopeId) ?? null,
      listByScope: (scope) => records.filter((r) => r.scope === scope),
      replenish: (id, additionalTokens, _additionalUsd, _expectedRev, _now) => {
        const record = records.find((r) => r.id === id);
        if (!record) throw new Error('Not found');
        return { ...record, limitTokens: record.limitTokens + additionalTokens, rev: record.rev + 1 };
      },
      resetConsumption: (id, _expectedRev, _now) => {
        const record = records.find((r) => r.id === id);
        if (!record) throw new Error('Not found');
        return { ...record, consumedTokens: 0, consumedUsd: 0, status: 'active', rev: record.rev + 1 };
      },
    };
  });

  it('GET /api/budget?scope=global returns all global records', async () => {
    const handler = createBudgetQueryHandler(budgetDeps);
    const req = mockRequest('GET', '/api/budget?scope=global');
    const { res, getResult } = captureResponse();

    await handler(req, res);
    const result = getResult();
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { records: unknown[] };
    expect(parsed.records).toHaveLength(2);
  });

  it('GET /api/budget?scope=global&scopeId=default returns single record', async () => {
    const handler = createBudgetQueryHandler(budgetDeps);
    const req = mockRequest('GET', '/api/budget?scope=global&scopeId=default');
    const { res, getResult } = captureResponse();

    await handler(req, res);
    const result = getResult();
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { record: { id: string } };
    expect(parsed.record.id).toBe('B1');
  });

  it('GET /api/budget without scope returns 400', async () => {
    const handler = createBudgetQueryHandler(budgetDeps);
    const req = mockRequest('GET', '/api/budget');
    const { res, getResult } = captureResponse();

    await handler(req, res);
    expect(getResult().statusCode).toBe(400);
  });

  it('POST /api/budget/replenish returns updated record', async () => {
    const handler = createBudgetQueryHandler(budgetDeps);
    const req = mockRequest('POST', '/api/budget/replenish', JSON.stringify({
      id: 'B1',
      additionalTokens: 5000,
      additionalUsd: 2,
      expectedRev: 1,
    }));
    const { res, getResult } = captureResponse();

    await handler(req, res);
    const result = getResult();
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { record: { limitTokens: number; rev: number } };
    expect(parsed.record.limitTokens).toBe(15000);
    expect(parsed.record.rev).toBe(2);
  });

  it('POST /api/budget/reset returns reset record', async () => {
    const handler = createBudgetQueryHandler(budgetDeps);
    const req = mockRequest('POST', '/api/budget/reset', JSON.stringify({
      id: 'B1',
      expectedRev: 1,
    }));
    const { res, getResult } = captureResponse();

    await handler(req, res);
    const result = getResult();
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { record: { consumedTokens: number } };
    expect(parsed.record.consumedTokens).toBe(0);
  });

  it('unknown path returns 404', async () => {
    const handler = createBudgetQueryHandler(budgetDeps);
    const req = mockRequest('GET', '/api/budget/unknown');
    const { res, getResult } = captureResponse();

    await handler(req, res);
    expect(getResult().statusCode).toBe(404);
  });
});

describe('decision query handler', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
    // Create agent_decisions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_decisions (
        id TEXT PRIMARY KEY,
        task_ref TEXT,
        agent_id TEXT NOT NULL,
        category TEXT NOT NULL,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        decision TEXT,
        reasoning TEXT,
        escalated INTEGER NOT NULL DEFAULT 0,
        approver TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        outcome TEXT
      )
    `);
  });

  afterEach(() => {
    db?.close();
  });

  it('GET /api/decisions?status=pending returns pending escalated decisions', async () => {
    db.prepare(
      "INSERT INTO agent_decisions (id, agent_id, category, question, options, escalated, approver, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('D001', 'back-1', 'technical', 'Which ORM?', '[]', 1, 'human', '2026-03-01T12:00:00Z');

    db.prepare(
      "INSERT INTO agent_decisions (id, agent_id, category, question, options, decision, escalated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('D002', 'back-1', 'scope', 'Include feature X?', '[]', 'yes', 0, '2026-03-01T12:00:00Z');

    const handler = createDecisionQueryHandler({ db });
    const req = mockRequest('GET', '/api/decisions?status=pending');
    const { res, getResult } = captureResponse();

    await handler(req, res);
    const result = getResult();
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { decisions: Array<{ id: string }> };
    expect(parsed.decisions).toHaveLength(1);
    expect(parsed.decisions[0]!.id).toBe('D001');
  });

  it('POST /api/decisions/approve resolves a decision', async () => {
    db.prepare(
      "INSERT INTO agent_decisions (id, agent_id, category, question, options, escalated, approver, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('D003', 'back-1', 'technical', 'Which DB?', '[]', 1, 'human', '2026-03-01T12:00:00Z');

    const handler = createDecisionQueryHandler({ db });
    const req = mockRequest('POST', '/api/decisions/approve', JSON.stringify({
      decisionId: 'D003',
      choice: 'postgres',
    }));
    const { res, getResult } = captureResponse();

    await handler(req, res);
    const result = getResult();
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { approved: boolean };
    expect(parsed.approved).toBe(true);

    // Verify in DB
    const row = db.prepare('SELECT decision FROM agent_decisions WHERE id = ?').get('D003') as { decision: string };
    expect(row.decision).toBe('postgres');
  });

  it('POST /api/decisions/approve returns 404 for unknown decision', async () => {
    const handler = createDecisionQueryHandler({ db });
    const req = mockRequest('POST', '/api/decisions/approve', JSON.stringify({
      decisionId: 'UNKNOWN',
      choice: 'x',
    }));
    const { res, getResult } = captureResponse();

    await handler(req, res);
    expect(getResult().statusCode).toBe(404);
  });

  it('POST /api/decisions/reject re-escalates to tech-lead', async () => {
    db.prepare(
      "INSERT INTO agent_decisions (id, agent_id, category, question, options, escalated, approver, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('D004', 'front-1', 'quality', 'Skip lint?', '[]', 1, 'human', '2026-03-01T12:00:00Z');

    const handler = createDecisionQueryHandler({ db });
    const req = mockRequest('POST', '/api/decisions/reject', JSON.stringify({
      decisionId: 'D004',
      reason: 'Not acceptable',
    }));
    const { res, getResult } = captureResponse();

    await handler(req, res);
    const result = getResult();
    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { rejected: boolean; reEscalatedTo: string };
    expect(parsed.rejected).toBe(true);
    expect(parsed.reEscalatedTo).toBe('tech-lead');

    const row = db.prepare('SELECT approver, reasoning FROM agent_decisions WHERE id = ?').get('D004') as { approver: string; reasoning: string };
    expect(row.approver).toBe('tech-lead');
    expect(row.reasoning).toContain('Rejected via API');
  });

  it('POST /api/decisions/reject returns 409 for already-resolved decision', async () => {
    db.prepare(
      "INSERT INTO agent_decisions (id, agent_id, category, question, options, decision, escalated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('D005', 'back-1', 'technical', 'Q?', '[]', 'yes', 1, '2026-03-01T12:00:00Z');

    const handler = createDecisionQueryHandler({ db });
    const req = mockRequest('POST', '/api/decisions/reject', JSON.stringify({
      decisionId: 'D005',
      reason: 'no',
    }));
    const { res, getResult } = captureResponse();

    await handler(req, res);
    expect(getResult().statusCode).toBe(409);
  });
});
