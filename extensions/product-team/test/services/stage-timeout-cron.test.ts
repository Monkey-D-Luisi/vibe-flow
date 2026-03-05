import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { sweepStageTimeouts, StageTimeoutCron, type StageTimeoutDeps } from '../../src/services/stage-timeout-cron.js';

function createDeps(overrides?: Partial<StageTimeoutDeps>): StageTimeoutDeps {
  const db = new Database(':memory:');
  // Create task_records and agent_messages tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_records (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      assignee TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      rev INTEGER NOT NULL DEFAULT 1,
      pipeline_stage TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
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
  let idCounter = 0;
  return {
    db,
    generateId: vi.fn(() => `timeout-${String(++idCounter).padStart(3, '0')}`),
    now: vi.fn(() => '2026-03-05T12:00:00.000Z'),
    logger: { info: vi.fn(), warn: vi.fn() },
    orchestratorConfig: {
      stageTimeouts: { IMPLEMENTATION: 1000 }, // 1 second timeout for testing
    },
    ...overrides,
  };
}

describe('stage-timeout-cron', () => {
  let deps: StageTimeoutDeps;

  beforeEach(() => {
    deps = createDeps();
  });

  afterEach(() => {
    deps.db.close();
  });

  describe('sweepStageTimeouts', () => {
    it('returns 0 when no stage timeouts are configured', () => {
      deps = createDeps({ orchestratorConfig: {} });
      expect(sweepStageTimeouts(deps)).toBe(0);
    });

    it('returns 0 when there are no pipeline tasks', () => {
      expect(sweepStageTimeouts(deps)).toBe(0);
    });

    it('returns 0 when pipeline task has not timed out', () => {
      const meta = {
        pipelineStage: 'IMPLEMENTATION',
        IMPLEMENTATION_startedAt: new Date().toISOString(), // just started
      };
      deps.db.prepare(`
        INSERT INTO task_records (id, title, tags, metadata, pipeline_stage, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('task-1', 'Test task', '["pipeline"]', JSON.stringify(meta), 'IMPLEMENTATION', 'in_progress');

      // Use a very long timeout so it won't trigger
      deps = createDeps({
        db: deps.db,
        orchestratorConfig: { stageTimeouts: { IMPLEMENTATION: 999_999_999 } },
      });
      expect(sweepStageTimeouts(deps)).toBe(0);
    });

    it('escalates to stage owner on first timeout', () => {
      const pastTime = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
      const meta = {
        pipelineStage: 'IMPLEMENTATION',
        pipelineOwner: 'back-1',
        IMPLEMENTATION_startedAt: pastTime,
      };
      deps.db.prepare(`
        INSERT INTO task_records (id, title, tags, metadata, pipeline_stage, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('task-2', 'Test task', '["pipeline"]', JSON.stringify(meta), 'IMPLEMENTATION', 'in_progress');

      const count = sweepStageTimeouts(deps);
      expect(count).toBe(1);

      // Check message was sent to stage owner
      const messages = deps.db.prepare('SELECT * FROM agent_messages').all() as Array<{ to_agent: string; subject: string; priority: string }>;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.to_agent).toBe('back-1');
      expect(messages[0]!.priority).toBe('urgent');
      expect(messages[0]!.subject).toContain('Stage Timeout');

      // Check metadata was updated with escalation flag
      const task = deps.db.prepare('SELECT metadata FROM task_records WHERE id = ?').get('task-2') as { metadata: string };
      const updatedMeta = JSON.parse(task.metadata);
      expect(updatedMeta.IMPLEMENTATION_timeoutEscalated).toBe(true);
    });

    it('escalates to tech-lead on second timeout', () => {
      const pastTime = new Date(Date.now() - 5000).toISOString();
      const meta = {
        pipelineStage: 'IMPLEMENTATION',
        pipelineOwner: 'back-1',
        IMPLEMENTATION_startedAt: pastTime,
        IMPLEMENTATION_timeoutEscalated: true, // already escalated once
      };
      deps.db.prepare(`
        INSERT INTO task_records (id, title, tags, metadata, pipeline_stage, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('task-3', 'Test task', '["pipeline"]', JSON.stringify(meta), 'IMPLEMENTATION', 'in_progress');

      const count = sweepStageTimeouts(deps);
      expect(count).toBe(1);

      const messages = deps.db.prepare('SELECT * FROM agent_messages').all() as Array<{ to_agent: string; body: string }>;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.to_agent).toBe('tech-lead');
      expect(messages[0]!.body).toContain('second timeout escalation');
    });

    it('skips tasks at DONE stage', () => {
      const pastTime = new Date(Date.now() - 5000).toISOString();
      const meta = {
        pipelineStage: 'DONE',
        DONE_startedAt: pastTime,
      };
      deps = createDeps({
        db: deps.db,
        orchestratorConfig: { stageTimeouts: { DONE: 1000 } },
      });
      deps.db.prepare(`
        INSERT INTO task_records (id, title, tags, metadata, pipeline_stage, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('task-4', 'Test task', '["pipeline"]', JSON.stringify(meta), 'DONE', 'done');

      // status='done' is excluded by the WHERE clause
      expect(sweepStageTimeouts(deps)).toBe(0);
    });

    it('skips tasks with unparseable metadata', () => {
      deps.db.prepare(`
        INSERT INTO task_records (id, title, tags, metadata, pipeline_stage, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('task-5', 'Bad meta', '["pipeline"]', 'not-json', 'IMPLEMENTATION', 'in_progress');

      expect(sweepStageTimeouts(deps)).toBe(0);
    });

    it('skips stages without configured timeout', () => {
      const pastTime = new Date(Date.now() - 5000).toISOString();
      const meta = {
        pipelineStage: 'QA',
        QA_startedAt: pastTime,
      };
      deps.db.prepare(`
        INSERT INTO task_records (id, title, tags, metadata, pipeline_stage, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('task-6', 'QA task', '["pipeline"]', JSON.stringify(meta), 'QA', 'in_progress');

      // Only IMPLEMENTATION has a timeout configured
      expect(sweepStageTimeouts(deps)).toBe(0);
    });

    it('uses pipelineStartedAt as fallback when stage start time is missing', () => {
      const pastTime = new Date(Date.now() - 5000).toISOString();
      const meta = {
        pipelineStage: 'IMPLEMENTATION',
        pipelineOwner: 'back-1',
        pipelineStartedAt: pastTime, // fallback
      };
      deps.db.prepare(`
        INSERT INTO task_records (id, title, tags, metadata, pipeline_stage, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('task-7', 'Fallback task', '["pipeline"]', JSON.stringify(meta), 'IMPLEMENTATION', 'in_progress');

      expect(sweepStageTimeouts(deps)).toBe(1);
    });

    it('returns 0 when task_records table does not exist', () => {
      const freshDb = new Database(':memory:');
      const freshDeps = createDeps({ db: freshDb });
      // No task_records table
      expect(sweepStageTimeouts(freshDeps)).toBe(0);
      freshDb.close();
    });
  });

  describe('StageTimeoutCron', () => {
    it('start() and stop() manage timer lifecycle', () => {
      const cron = new StageTimeoutCron(deps);
      cron.start();
      expect(deps.logger.info).toHaveBeenCalledWith('stage-timeout-cron: started');

      cron.stop();
      expect(deps.logger.info).toHaveBeenCalledWith('stage-timeout-cron: stopped');
    });

    it('stop() is safe to call when not started', () => {
      const cron = new StageTimeoutCron(deps);
      cron.stop(); // should not throw
      expect(deps.logger.info).toHaveBeenCalledWith('stage-timeout-cron: stopped');
    });
  });
});
