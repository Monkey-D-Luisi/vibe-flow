import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { DecisionPatternAnalyzer } from '../../src/orchestrator/decision-pattern-analyzer.js';

const DECISIONS_TABLE = 'agent_decisions';

function ensureDecisionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${DECISIONS_TABLE} (
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
  try { db.exec(`ALTER TABLE ${DECISIONS_TABLE} ADD COLUMN outcome TEXT`); } catch { /* exists */ }
}

function insertDecision(db: Database.Database, overrides: Partial<{
  id: string;
  task_ref: string;
  agent_id: string;
  category: string;
  question: string;
  options: string;
  decision: string | null;
  reasoning: string | null;
  escalated: number;
  approver: string | null;
  outcome: string | null;
  created_at: string;
}> = {}): void {
  const d = {
    id: overrides.id ?? `dec-${Math.random().toString(36).slice(2, 10)}`,
    task_ref: overrides.task_ref ?? 'TASK-001',
    agent_id: overrides.agent_id ?? 'back-1',
    category: overrides.category ?? 'technical',
    question: overrides.question ?? 'Test question?',
    options: overrides.options ?? JSON.stringify([{ id: 'a', description: 'A' }, { id: 'b', description: 'B' }]),
    decision: overrides.decision ?? 'a',
    reasoning: overrides.reasoning ?? null,
    escalated: overrides.escalated ?? 0,
    approver: overrides.approver ?? null,
    outcome: 'outcome' in overrides ? overrides.outcome : 'success',
    created_at: overrides.created_at ?? '2026-03-09T12:00:00.000Z',
  };

  db.prepare(`
    INSERT INTO ${DECISIONS_TABLE}
      (id, task_ref, agent_id, category, question, options, decision, reasoning, escalated, approver, outcome, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.id, d.task_ref, d.agent_id, d.category, d.question, d.options,
    d.decision, d.reasoning, d.escalated, d.approver, d.outcome, d.created_at,
  );
}

describe('DecisionPatternAnalyzer', () => {
  let db: Database.Database;
  let analyzer: DecisionPatternAnalyzer;

  beforeEach(() => {
    db = createTestDatabase();
    ensureDecisionsTable(db);
    analyzer = new DecisionPatternAnalyzer(db);
  });

  afterEach(() => {
    db?.close();
  });

  describe('empty history', () => {
    it('returns empty report when no decisions exist', () => {
      const report = analyzer.analyze();
      expect(report.analyzedDecisions).toBe(0);
      expect(report.patterns).toEqual([]);
      expect(report.recommendations).toEqual([]);
      expect(report.timeRange.from).toBe('');
      expect(report.timeRange.to).toBe('');
    });

    it('returns empty report when decisions have no outcomes', () => {
      insertDecision(db, { outcome: null });
      const report = analyzer.analyze();
      expect(report.analyzedDecisions).toBe(0);
    });
  });

  describe('escalation_candidate detection', () => {
    it('detects when auto-resolved decisions are frequently overridden', () => {
      // 5 auto-resolved decisions, 3 overridden — should trigger
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `esc-${i}`,
          agent_id: 'back-1',
          category: 'technical',
          escalated: 0,
          outcome: i < 3 ? 'overridden' : 'success',
          created_at: `2026-03-09T${String(12 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.5 });
      expect(report.patterns.length).toBe(1);
      expect(report.patterns[0].type).toBe('escalation_candidate');
      expect(report.patterns[0].agentId).toBe('back-1');
      expect(report.patterns[0].category).toBe('technical');
      expect(report.patterns[0].evidence.length).toBe(3);
      expect(report.patterns[0].confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('does not trigger when overrides are below threshold', () => {
      // 10 auto decisions, only 2 overridden
      for (let i = 0; i < 10; i++) {
        insertDecision(db, {
          id: `esc-no-${i}`,
          agent_id: 'back-1',
          category: 'technical',
          escalated: 0,
          outcome: i < 2 ? 'overridden' : 'success',
          created_at: `2026-03-09T${String(i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.5 });
      const escPatterns = report.patterns.filter((p) => p.type === 'escalation_candidate');
      expect(escPatterns.length).toBe(0);
    });

    it('isolates patterns by agent and category', () => {
      // Agent back-1 technical: 4 overridden
      for (let i = 0; i < 4; i++) {
        insertDecision(db, {
          id: `agent-a-${i}`,
          agent_id: 'back-1',
          category: 'technical',
          escalated: 0,
          outcome: 'overridden',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }
      // Agent front-1 technical: all success
      for (let i = 0; i < 4; i++) {
        insertDecision(db, {
          id: `agent-b-${i}`,
          agent_id: 'front-1',
          category: 'technical',
          escalated: 0,
          outcome: 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.5 });
      const escPatterns = report.patterns.filter((p) => p.type === 'escalation_candidate');
      expect(escPatterns.length).toBe(1);
      expect(escPatterns[0].agentId).toBe('back-1');
    });
  });

  describe('auto_candidate detection', () => {
    it('detects when escalated decisions are consistently approved with same answer', () => {
      // 5 escalated decisions, all approved with 'a'
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `auto-${i}`,
          agent_id: 'back-1',
          category: 'scope',
          escalated: 1,
          approver: 'tech-lead',
          decision: 'a',
          outcome: 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.7 });
      const autoPatterns = report.patterns.filter((p) => p.type === 'auto_candidate');
      expect(autoPatterns.length).toBe(1);
      expect(autoPatterns[0].agentId).toBe('back-1');
      expect(autoPatterns[0].category).toBe('scope');
      expect(autoPatterns[0].confidence).toBe(1.0);
    });

    it('does not trigger when answers vary', () => {
      const answers = ['a', 'b', 'a', 'b', 'a'];
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `auto-vary-${i}`,
          agent_id: 'back-1',
          category: 'scope',
          escalated: 1,
          approver: 'tech-lead',
          decision: answers[i],
          outcome: 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.7 });
      const autoPatterns = report.patterns.filter((p) => p.type === 'auto_candidate');
      expect(autoPatterns.length).toBe(0);
    });

    it('does not trigger with fewer than 3 escalated decisions', () => {
      for (let i = 0; i < 2; i++) {
        insertDecision(db, {
          id: `auto-few-${i}`,
          agent_id: 'back-1',
          category: 'scope',
          escalated: 1,
          approver: 'tech-lead',
          decision: 'a',
          outcome: 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.5 });
      const autoPatterns = report.patterns.filter((p) => p.type === 'auto_candidate');
      expect(autoPatterns.length).toBe(0);
    });
  });

  describe('failure_cluster detection', () => {
    it('detects when >= 50% of decisions fail', () => {
      // 6 decisions: 4 failed, 2 success
      for (let i = 0; i < 6; i++) {
        insertDecision(db, {
          id: `fail-${i}`,
          agent_id: 'qa',
          category: 'quality',
          outcome: i < 4 ? 'failed' : 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.5 });
      const failPatterns = report.patterns.filter((p) => p.type === 'failure_cluster');
      expect(failPatterns.length).toBe(1);
      expect(failPatterns[0].agentId).toBe('qa');
      expect(failPatterns[0].confidence).toBeCloseTo(4 / 6, 2);
    });

    it('does not trigger below 50% failure rate', () => {
      for (let i = 0; i < 6; i++) {
        insertDecision(db, {
          id: `fail-low-${i}`,
          agent_id: 'qa',
          category: 'quality',
          outcome: i < 2 ? 'failed' : 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.3 });
      const failPatterns = report.patterns.filter((p) => p.type === 'failure_cluster');
      expect(failPatterns.length).toBe(0);
    });

    it('requires minimum 4 decisions for cluster detection', () => {
      for (let i = 0; i < 3; i++) {
        insertDecision(db, {
          id: `fail-few-${i}`,
          agent_id: 'qa',
          category: 'quality',
          outcome: 'failed',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.3 });
      const failPatterns = report.patterns.filter((p) => p.type === 'failure_cluster');
      expect(failPatterns.length).toBe(0);
    });
  });

  describe('timeout_pattern detection', () => {
    it('detects consistent timeouts based on reasoning keywords', () => {
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `timeout-${i}`,
          agent_id: 'po',
          category: 'scope',
          reasoning: i < 3 ? 'Decision timed_out after 300s' : 'Normal reasoning',
          outcome: i < 3 ? 'failed' : 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.3 });
      const timeoutPatterns = report.patterns.filter((p) => p.type === 'timeout_pattern');
      expect(timeoutPatterns.length).toBe(1);
      expect(timeoutPatterns[0].agentId).toBe('po');
      expect(timeoutPatterns[0].evidence.length).toBe(3);
    });

    it('detects re-escalation patterns', () => {
      for (let i = 0; i < 4; i++) {
        insertDecision(db, {
          id: `reesc-${i}`,
          agent_id: 'tech-lead',
          category: 'conflict',
          reasoning: i < 2 ? 'Re-escalated from po due to inactivity' : 'Normal',
          outcome: i < 2 ? 'failed' : 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.3 });
      const timeoutPatterns = report.patterns.filter((p) => p.type === 'timeout_pattern');
      expect(timeoutPatterns.length).toBe(1);
    });

    it('does not trigger without timeout keywords', () => {
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `no-timeout-${i}`,
          agent_id: 'po',
          category: 'scope',
          reasoning: 'Normal decision reasoning',
          outcome: 'failed',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.3 });
      const timeoutPatterns = report.patterns.filter((p) => p.type === 'timeout_pattern');
      expect(timeoutPatterns.length).toBe(0);
    });
  });

  describe('confidence threshold filtering', () => {
    it('filters patterns below minConfidence', () => {
      // Create an escalation_candidate with 3/5 = 0.6 confidence
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `conf-${i}`,
          agent_id: 'back-1',
          category: 'technical',
          escalated: 0,
          outcome: i < 3 ? 'overridden' : 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      // With 0.7 threshold, should filter out the 0.6 confidence pattern
      const high = analyzer.analyze({ minConfidence: 0.7 });
      expect(high.patterns.length).toBe(0);

      // With 0.5 threshold, should include it
      const low = analyzer.analyze({ minConfidence: 0.5 });
      expect(low.patterns.length).toBe(1);
    });

    it('uses default 0.7 confidence threshold', () => {
      // 3 overridden out of 5 = 0.6 confidence
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `def-conf-${i}`,
          agent_id: 'back-1',
          category: 'technical',
          escalated: 0,
          outcome: i < 3 ? 'overridden' : 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze();
      expect(report.patterns.length).toBe(0);
    });
  });

  describe('configuration', () => {
    it('respects lastN parameter', () => {
      for (let i = 0; i < 20; i++) {
        insertDecision(db, {
          id: `lastn-${String(i).padStart(3, '0')}`,
          agent_id: 'back-1',
          category: 'technical',
          escalated: 0,
          outcome: 'overridden',
          created_at: `2026-03-09T${String(i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const limited = analyzer.analyze({ lastN: 5, minConfidence: 0.5 });
      expect(limited.analyzedDecisions).toBe(5);

      const full = analyzer.analyze({ lastN: 100, minConfidence: 0.5 });
      expect(full.analyzedDecisions).toBe(20);
    });
  });

  describe('idempotency', () => {
    it('produces identical results for the same data', () => {
      for (let i = 0; i < 10; i++) {
        insertDecision(db, {
          id: `idem-${i}`,
          agent_id: 'back-1',
          category: 'technical',
          escalated: 0,
          outcome: i < 5 ? 'overridden' : 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report1 = analyzer.analyze({ minConfidence: 0.3 });
      const report2 = analyzer.analyze({ minConfidence: 0.3 });

      expect(report1.analyzedDecisions).toBe(report2.analyzedDecisions);
      expect(report1.patterns.length).toBe(report2.patterns.length);
      expect(report1.recommendations.length).toBe(report2.recommendations.length);
      for (let i = 0; i < report1.patterns.length; i++) {
        expect(report1.patterns[i].type).toBe(report2.patterns[i].type);
        expect(report1.patterns[i].confidence).toBe(report2.patterns[i].confidence);
        expect(report1.patterns[i].evidence.length).toBe(report2.patterns[i].evidence.length);
      }
    });
  });

  describe('recommendations', () => {
    it('generates change_policy recommendation for escalation candidates', () => {
      for (let i = 0; i < 4; i++) {
        insertDecision(db, {
          id: `rec-esc-${i}`,
          agent_id: 'back-1',
          category: 'technical',
          escalated: 0,
          outcome: 'overridden',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.5 });
      expect(report.recommendations.length).toBe(1);
      expect(report.recommendations[0].action).toBe('change_policy');
      expect(report.recommendations[0].patternType).toBe('escalation_candidate');
      expect((report.recommendations[0].details as { newPolicy: string }).newPolicy).toBe('escalate');
    });

    it('generates change_policy recommendation for auto candidates', () => {
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `rec-auto-${i}`,
          agent_id: 'back-1',
          category: 'scope',
          escalated: 1,
          approver: 'tech-lead',
          decision: 'a',
          outcome: 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.7 });
      const autoRecs = report.recommendations.filter((r) => r.patternType === 'auto_candidate');
      expect(autoRecs.length).toBe(1);
      expect(autoRecs[0].action).toBe('change_policy');
      expect((autoRecs[0].details as { newPolicy: string }).newPolicy).toBe('auto');
    });

    it('generates alert_human recommendation for failure clusters', () => {
      for (let i = 0; i < 6; i++) {
        insertDecision(db, {
          id: `rec-fail-${i}`,
          agent_id: 'qa',
          category: 'quality',
          outcome: i < 4 ? 'failed' : 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.5 });
      const failRecs = report.recommendations.filter((r) => r.patternType === 'failure_cluster');
      expect(failRecs.length).toBe(1);
      expect(failRecs[0].action).toBe('alert_human');
    });

    it('generates adjust_timeout recommendation for timeout patterns', () => {
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `rec-to-${i}`,
          agent_id: 'po',
          category: 'scope',
          reasoning: i < 3 ? 'Decision timed_out' : 'Normal',
          outcome: i < 3 ? 'failed' : 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.3 });
      const toRecs = report.recommendations.filter((r) => r.patternType === 'timeout_pattern');
      expect(toRecs.length).toBe(1);
      expect(toRecs[0].action).toBe('adjust_timeout');
    });
  });

  describe('time range reporting', () => {
    it('reports correct time range from analyzed decisions', () => {
      insertDecision(db, {
        id: 'tr-1',
        outcome: 'success',
        created_at: '2026-03-01T10:00:00.000Z',
      });
      insertDecision(db, {
        id: 'tr-2',
        outcome: 'success',
        created_at: '2026-03-09T18:00:00.000Z',
      });

      const report = analyzer.analyze();
      expect(report.timeRange.from).toBe('2026-03-01T10:00:00.000Z');
      expect(report.timeRange.to).toBe('2026-03-09T18:00:00.000Z');
    });
  });

  describe('table does not exist', () => {
    it('returns empty report when agent_decisions table is missing', () => {
      const freshDb = createTestDatabase();
      // Do NOT create the decisions table
      const freshAnalyzer = new DecisionPatternAnalyzer(freshDb);
      const report = freshAnalyzer.analyze();
      expect(report.analyzedDecisions).toBe(0);
      expect(report.patterns).toEqual([]);
      freshDb.close();
    });
  });

  describe('mixed pattern detection', () => {
    it('detects multiple patterns across different agents and categories', () => {
      // Escalation candidate: back-1 + technical
      for (let i = 0; i < 4; i++) {
        insertDecision(db, {
          id: `mix-esc-${i}`,
          agent_id: 'back-1',
          category: 'technical',
          escalated: 0,
          outcome: 'overridden',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      // Auto candidate: qa + quality
      for (let i = 0; i < 5; i++) {
        insertDecision(db, {
          id: `mix-auto-${i}`,
          agent_id: 'qa',
          category: 'quality',
          escalated: 1,
          approver: 'tech-lead',
          decision: 'pass',
          outcome: 'success',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      // Failure cluster: devops + budget
      for (let i = 0; i < 6; i++) {
        insertDecision(db, {
          id: `mix-fail-${i}`,
          agent_id: 'devops',
          category: 'budget',
          outcome: 'failed',
          created_at: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      const report = analyzer.analyze({ minConfidence: 0.5 });
      const types = report.patterns.map((p) => p.type).sort();
      expect(types).toContain('escalation_candidate');
      expect(types).toContain('auto_candidate');
      expect(types).toContain('failure_cluster');
      expect(report.recommendations.length).toBeGreaterThanOrEqual(3);
    });
  });
});
