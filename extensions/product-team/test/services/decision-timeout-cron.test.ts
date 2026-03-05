import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { sweepDecisionTimeouts, type DecisionTimeoutDeps } from '../../src/services/decision-timeout-cron.js';

describe('sweepDecisionTimeouts', () => {
  let db: Database.Database;
  let deps: DecisionTimeoutDeps;
  let idCounter: number;

  function createDecisionsTable(): void {
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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  function createMessagesTable(): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id TEXT PRIMARY KEY,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        task_ref TEXT,
        reply_to TEXT,
        read INTEGER NOT NULL DEFAULT 0,
        origin_channel TEXT,
        origin_session_key TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;
    deps = {
      db,
      generateId: () => `TIMEOUT_${String(++idCounter).padStart(5, '0')}`,
      now: () => new Date().toISOString(),
      logger: { info: vi.fn(), warn: vi.fn() },
      decisionConfig: {
        timeoutMs: 1000,           // 1s for testing
        humanApprovalTimeout: 2000, // 2s for testing
      },
    };
    createDecisionsTable();
    createMessagesTable();
  });

  afterEach(() => {
    db?.close();
  });

  it('returns 0 when no decisions exist', () => {
    expect(sweepDecisionTimeouts(deps)).toBe(0);
  });

  it('returns 0 when agent_decisions table does not exist', () => {
    db.exec('DROP TABLE IF EXISTS agent_decisions');
    expect(sweepDecisionTimeouts(deps)).toBe(0);
  });

  it('does not escalate non-timed-out decisions', () => {
    // Insert a recent escalated decision
    db.prepare(`
      INSERT INTO agent_decisions (id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)
    `).run('d1', 'task-1', 'back-1', 'scope', 'Q?', '[]', 'Escalated', 'tech-lead', new Date().toISOString());

    expect(sweepDecisionTimeouts(deps)).toBe(0);
  });

  it('escalates agent decisions that have timed out', () => {
    // Insert an old escalated decision (well past 1s timeout)
    const oldTime = new Date(Date.now() - 5000).toISOString();
    db.prepare(`
      INSERT INTO agent_decisions (id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)
    `).run('d1', 'task-1', 'back-1', 'scope', 'Should we?', '[]', 'Escalated to tech-lead', 'tech-lead', oldTime);

    const count = sweepDecisionTimeouts(deps);
    expect(count).toBe(1);

    // Check the decision was updated
    const row = db.prepare('SELECT approver, reasoning FROM agent_decisions WHERE id = ?').get('d1') as { approver: string; reasoning: string };
    expect(row.approver).toBe('pm');
    expect(row.reasoning).toContain('[TIMEOUT: re-escalated to pm]');

    // Check a message was sent
    const msg = db.prepare('SELECT * FROM agent_messages WHERE to_agent = ?').get('pm') as { subject: string; priority: string } | undefined;
    expect(msg).toBeDefined();
    expect(msg?.subject).toContain('[Timeout Escalation]');
    expect(msg?.priority).toBe('urgent');
  });

  it('escalates human decisions to tech-lead on timeout', () => {
    const oldTime = new Date(Date.now() - 5000).toISOString();
    db.prepare(`
      INSERT INTO agent_decisions (id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)
    `).run('d2', 'task-2', 'back-1', 'budget', 'Over budget?', '[]', 'Paused for human', 'human', oldTime);

    const count = sweepDecisionTimeouts(deps);
    expect(count).toBe(1);

    const row = db.prepare('SELECT approver FROM agent_decisions WHERE id = ?').get('d2') as { approver: string };
    expect(row.approver).toBe('tech-lead');
  });

  it('skips already-resolved decisions (decision IS NOT NULL)', () => {
    const oldTime = new Date(Date.now() - 5000).toISOString();
    db.prepare(`
      INSERT INTO agent_decisions (id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run('d3', 'task-3', 'back-1', 'scope', 'Resolved?', '[]', 'yes', 'Was resolved', 'tech-lead', oldTime);

    expect(sweepDecisionTimeouts(deps)).toBe(0);
  });

  it('stops re-escalating after 2 timeout rounds (marks as timed_out)', () => {
    const oldTime = new Date(Date.now() - 5000).toISOString();
    db.prepare(`
      INSERT INTO agent_decisions (id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)
    `).run('d4', 'task-4', 'back-1', 'scope', 'Q?', '[]', 'Escalated', 'tech-lead', oldTime);

    // First sweep escalates to pm (adds 1 TIMEOUT marker)
    expect(sweepDecisionTimeouts(deps)).toBe(1);

    // Second sweep re-escalates pm → pm (adds 2nd TIMEOUT marker)
    expect(sweepDecisionTimeouts(deps)).toBe(1);

    // Third sweep: 2 TIMEOUT markers already present → marks decision as timed_out
    expect(sweepDecisionTimeouts(deps)).toBe(1);

    // Decision should now have decision = 'timed_out'
    const row = db.prepare('SELECT decision, reasoning FROM agent_decisions WHERE id = ?').get('d4') as { decision: string | null; reasoning: string };
    expect(row.decision).toBe('timed_out');
    expect(row.reasoning).toContain('max escalation rounds reached');

    // Fourth sweep: decision IS NOT NULL, so it's no longer picked up
    expect(sweepDecisionTimeouts(deps)).toBe(0);
  });
});
