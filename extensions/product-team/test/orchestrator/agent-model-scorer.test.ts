import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { AgentModelScorer } from '../../src/orchestrator/agent-model-scorer.js';

const NOW = '2026-03-09T12:00:00.000Z';
const TASK_ID = 'TASK-001';

function ensureDecisionsTable(db: Database.Database): void {
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
  try { db.exec('ALTER TABLE agent_decisions ADD COLUMN outcome TEXT'); } catch { /* exists */ }
}

function ensureTaskRecord(db: Database.Database, taskId: string = TASK_ID): void {
  db.prepare(`
    INSERT OR IGNORE INTO task_records (id, title, status, scope, created_at, updated_at, rev)
    VALUES (?, 'Test Task', 'in_progress', 'minor', ?, ?, 1)
  `).run(taskId, NOW, NOW);
}

function insertCostEvent(db: Database.Database, overrides: {
  agentId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  stepId?: string;
  taskId?: string;
  createdAt?: string;
}): void {
  const id = `ev-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(`
    INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
    VALUES (?, ?, 'cost.llm', ?, ?, ?)
  `).run(
    id,
    overrides.taskId ?? 'TASK-001',
    overrides.agentId,
    JSON.stringify({
      model: overrides.model,
      inputTokens: overrides.inputTokens ?? 500,
      outputTokens: overrides.outputTokens ?? 200,
      durationMs: overrides.durationMs ?? 1000,
      stepId: overrides.stepId ?? 'IMPLEMENTATION',
    }),
    overrides.createdAt ?? NOW,
  );
}

function insertDecision(db: Database.Database, agentId: string, outcome: string): void {
  const id = `dec-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(`
    INSERT INTO agent_decisions (id, agent_id, category, question, options, outcome, created_at)
    VALUES (?, ?, 'technical', 'test?', '[]', ?, ?)
  `).run(id, agentId, outcome, NOW);
}

function insertQualityEvent(db: Database.Database, agentId: string, passed: boolean): void {
  const id = `qev-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(`
    INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
    VALUES (?, 'TASK-001', 'quality.gate', ?, ?, ?)
  `).run(id, agentId, JSON.stringify({ passed }), NOW);
}

describe('AgentModelScorer', () => {
  let db: Database.Database;
  let idCounter: number;
  let scorer: AgentModelScorer;

  beforeEach(() => {
    db = createTestDatabase();
    ensureDecisionsTable(db);
    ensureTaskRecord(db);
    idCounter = 0;
    scorer = new AgentModelScorer(
      db,
      () => `SC_${String(++idCounter).padStart(10, '0')}`,
      () => NOW,
      { minSampleSize: 3 },
    );
  });

  afterEach(() => {
    db?.close();
  });

  describe('discoverAgentModelPairs', () => {
    it('returns empty scores when no cost events exist', () => {
      const scores = scorer.computeScores();
      expect(scores).toEqual([]);
    });
  });

  describe('computeScores', () => {
    it('computes scores for agent x model x taskType combinations', () => {
      // Insert enough cost events to meet minSampleSize (3)
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, {
          agentId: 'back-1',
          model: 'claude-sonnet',
          stepId: 'IMPLEMENTATION',
          inputTokens: 500,
          outputTokens: 200,
          durationMs: 1000,
        });
      }

      for (let i = 0; i < 5; i++) {
        insertDecision(db, 'back-1', i < 4 ? 'success' : 'failed');
      }

      const scores = scorer.computeScores();
      expect(scores.length).toBe(1);
      expect(scores[0].agentId).toBe('back-1');
      expect(scores[0].modelId).toBe('claude-sonnet');
      expect(scores[0].taskType).toBe('IMPLEMENTATION');
      expect(scores[0].sampleSize).toBe(5);
      expect(scores[0].score).toBeGreaterThan(0);
      expect(scores[0].score).toBeLessThanOrEqual(100);
    });

    it('respects minSampleSize', () => {
      insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });

      const scores = scorer.computeScores();
      expect(scores.length).toBe(0);
    });

    it('separates scores by model', () => {
      for (let i = 0; i < 4; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }
      for (let i = 0; i < 4; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-haiku' });
      }

      const scores = scorer.computeScores();
      expect(scores.length).toBe(2);
      const models = scores.map((s) => s.modelId).sort();
      expect(models).toEqual(['claude-haiku', 'claude-sonnet']);
    });

    it('separates scores by taskType', () => {
      for (let i = 0; i < 4; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet', stepId: 'IMPLEMENTATION' });
      }
      for (let i = 0; i < 4; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet', stepId: 'REVIEW' });
      }

      const scores = scorer.computeScores();
      expect(scores.length).toBe(2);
      const types = scores.map((s) => s.taskType).sort();
      expect(types).toEqual(['IMPLEMENTATION', 'REVIEW']);
    });
  });

  describe('scoring dimensions', () => {
    it('success rate reflects decision outcomes', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }

      // 4/5 success = 80%
      for (let i = 0; i < 5; i++) {
        insertDecision(db, 'back-1', i < 4 ? 'success' : 'failed');
      }

      const scores = scorer.computeScores();
      expect(scores[0].dimensions.successRate).toBe(80);
    });

    it('quality score reflects gate pass rate', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }

      // 3/5 pass = 60%
      for (let i = 0; i < 5; i++) {
        insertQualityEvent(db, 'back-1', i < 3);
      }

      const scores = scorer.computeScores();
      expect(scores[0].dimensions.qualityScore).toBe(60);
    });

    it('defaults to 50 when no decisions exist', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }

      const scores = scorer.computeScores();
      expect(scores[0].dimensions.successRate).toBe(50);
      expect(scores[0].dimensions.qualityScore).toBe(50);
    });
  });

  describe('composite scoring', () => {
    it('applies weighted dimensions to composite score', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }

      const scores = scorer.computeScores();
      const s = scores[0];
      // Verify composite is a weighted sum
      const expected =
        s.dimensions.successRate * 0.4 +
        s.dimensions.qualityScore * 0.25 +
        s.dimensions.tokenEfficiency * 0.2 +
        s.dimensions.durationEfficiency * 0.15;
      expect(s.score).toBeCloseTo(Math.round(expected * 10) / 10, 1);
    });
  });

  describe('trend detection', () => {
    it('detects improving trend when score increases significantly', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }

      // First computation: low success rate
      for (let i = 0; i < 10; i++) {
        insertDecision(db, 'back-1', 'failed');
      }
      scorer.computeScores();

      // Improve: change outcomes to success
      db.exec('DELETE FROM agent_decisions');
      for (let i = 0; i < 10; i++) {
        insertDecision(db, 'back-1', 'success');
      }

      const scores = scorer.computeScores();
      expect(scores[0].trend).toBe('improving');
    });

    it('returns stable for first computation', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }

      const scores = scorer.computeScores();
      expect(scores[0].trend).toBe('stable');
    });
  });

  describe('getBestModel', () => {
    it('returns the highest scoring model for an agent x taskType', () => {
      // Insert events for two models
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, {
          agentId: 'back-1',
          model: 'claude-sonnet',
          inputTokens: 500,
          outputTokens: 200,
        });
      }
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, {
          agentId: 'back-1',
          model: 'claude-haiku',
          inputTokens: 200,
          outputTokens: 100,
        });
      }

      // Good success rate for both
      for (let i = 0; i < 10; i++) {
        insertDecision(db, 'back-1', 'success');
      }

      scorer.computeScores();
      const rec = scorer.getBestModel('back-1', 'IMPLEMENTATION');

      expect(rec).not.toBeNull();
      expect(rec!.agentId).toBe('back-1');
      expect(rec!.taskType).toBe('IMPLEMENTATION');
      expect(rec!.score).toBeGreaterThan(0);
      expect(rec!.confidence).toBeGreaterThan(0);
    });

    it('returns null when no scores exist', () => {
      const rec = scorer.getBestModel('back-1', 'IMPLEMENTATION');
      expect(rec).toBeNull();
    });

    it('returns null when sample size is insufficient', () => {
      insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      scorer.computeScores();

      const rec = scorer.getBestModel('back-1', 'IMPLEMENTATION');
      expect(rec).toBeNull();
    });

    it('confidence increases with sample size', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }
      scorer.computeScores();
      const low = scorer.getBestModel('back-1', 'IMPLEMENTATION');

      // Add more samples
      for (let i = 0; i < 15; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }
      scorer.computeScores();
      const high = scorer.getBestModel('back-1', 'IMPLEMENTATION');

      expect(high!.confidence).toBeGreaterThan(low!.confidence);
    });
  });

  describe('getAllScores and getScoresByAgent', () => {
    it('returns all stored scores', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
        insertCostEvent(db, { agentId: 'front-1', model: 'claude-haiku' });
      }

      scorer.computeScores();

      const all = scorer.getAllScores();
      expect(all.length).toBe(2);
    });

    it('filters by agent', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
        insertCostEvent(db, { agentId: 'front-1', model: 'claude-haiku' });
      }

      scorer.computeScores();

      const agentScores = scorer.getScoresByAgent('back-1');
      expect(agentScores.length).toBe(1);
      expect(agentScores[0].agentId).toBe('back-1');
    });
  });

  describe('idempotency', () => {
    it('updates existing scores on re-computation', () => {
      for (let i = 0; i < 5; i++) {
        insertCostEvent(db, { agentId: 'back-1', model: 'claude-sonnet' });
      }

      const first = scorer.computeScores();
      const second = scorer.computeScores();

      expect(first.length).toBe(second.length);
      // Should have updated, not duplicated
      expect(scorer.getAllScores().length).toBe(1);
    });
  });
});
