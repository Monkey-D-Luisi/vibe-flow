import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { AdaptiveEscalationEngine } from '../../src/orchestrator/adaptive-escalation.js';
import type { PatternReport } from '../../src/schemas/decision-patterns.schema.js';

const NOW = '2026-03-09T12:00:00.000Z';

function makeReport(recommendations: PatternReport['recommendations']): PatternReport {
  return {
    analyzedDecisions: 100,
    timeRange: { from: '2026-03-01T00:00:00.000Z', to: NOW },
    patterns: [],
    recommendations,
  };
}

function escalationRec(category: string, agentId: string, confidence: number = 0.8): PatternReport['recommendations'][0] {
  return {
    patternType: 'escalation_candidate',
    action: 'change_policy',
    details: { category, agentId, newPolicy: 'escalate', reason: 'test' },
    confidence,
  };
}

function autoRec(category: string, agentId: string, confidence: number = 0.9): PatternReport['recommendations'][0] {
  return {
    patternType: 'auto_candidate',
    action: 'change_policy',
    details: { category, agentId, newPolicy: 'auto', reason: 'test' },
    confidence,
  };
}

describe('AdaptiveEscalationEngine', () => {
  let db: Database.Database;
  let engine: AdaptiveEscalationEngine;
  let idCounter: number;

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;
    engine = new AdaptiveEscalationEngine(
      db,
      () => `AE_${String(++idCounter).padStart(10, '0')}`,
      () => NOW,
      { dampeningWindow: 5 },
    );
  });

  afterEach(() => {
    db?.close();
  });

  describe('policy application', () => {
    it('applies escalation_candidate recommendations as policy changes', () => {
      const report = makeReport([escalationRec('technical', 'back-1')]);
      const changes = engine.applyPatternReport(report, 10);

      expect(changes.length).toBe(1);
      expect(changes[0].category).toBe('technical');
      expect(changes[0].agentId).toBe('back-1');
      expect(changes[0].newAction).toBe('escalate');
      expect(changes[0].previousAction).toBeNull();
    });

    it('applies auto_candidate recommendations as policy changes', () => {
      const report = makeReport([autoRec('scope', 'back-1')]);
      const changes = engine.applyPatternReport(report, 10);

      expect(changes.length).toBe(1);
      expect(changes[0].newAction).toBe('auto');
    });

    it('stores policy in database', () => {
      const report = makeReport([escalationRec('technical', 'back-1')]);
      engine.applyPatternReport(report, 10);

      const policy = engine.getPolicy('technical', 'back-1');
      expect(policy).not.toBeNull();
      expect(policy!.action).toBe('escalate');
      expect(policy!.confidence).toBe(0.8);
      expect(policy!.pipelineRunAt).toBe(10);
      expect(policy!.humanOverride).toBe(false);
    });

    it('updates existing policy on subsequent recommendation', () => {
      const report1 = makeReport([escalationRec('technical', 'back-1')]);
      engine.applyPatternReport(report1, 1);

      const report2 = makeReport([autoRec('technical', 'back-1')]);
      const changes = engine.applyPatternReport(report2, 10);

      expect(changes.length).toBe(1);
      expect(changes[0].previousAction).toBe('escalate');
      expect(changes[0].newAction).toBe('auto');

      const policy = engine.getPolicy('technical', 'back-1');
      expect(policy!.action).toBe('auto');
    });

    it('ignores non-change_policy recommendations', () => {
      const report = makeReport([{
        patternType: 'failure_cluster',
        action: 'alert_human',
        details: { category: 'quality', agentId: 'qa' },
        confidence: 0.9,
      }]);
      const changes = engine.applyPatternReport(report, 10);
      expect(changes.length).toBe(0);
    });

    it('skips if new policy matches existing policy', () => {
      const report1 = makeReport([escalationRec('technical', 'back-1')]);
      engine.applyPatternReport(report1, 1);

      const report2 = makeReport([escalationRec('technical', 'back-1')]);
      const changes = engine.applyPatternReport(report2, 10);

      expect(changes.length).toBe(0);
    });
  });

  describe('dampening', () => {
    it('prevents policy change within dampening window', () => {
      const report1 = makeReport([escalationRec('technical', 'back-1')]);
      engine.applyPatternReport(report1, 10);

      // Try to change within 5 pipeline runs
      const report2 = makeReport([autoRec('technical', 'back-1')]);
      const changes = engine.applyPatternReport(report2, 12);

      expect(changes.length).toBe(0);

      const policy = engine.getPolicy('technical', 'back-1');
      expect(policy!.action).toBe('escalate');
    });

    it('allows policy change after dampening window expires', () => {
      const report1 = makeReport([escalationRec('technical', 'back-1')]);
      engine.applyPatternReport(report1, 10);

      // After 5 pipeline runs
      const report2 = makeReport([autoRec('technical', 'back-1')]);
      const changes = engine.applyPatternReport(report2, 15);

      expect(changes.length).toBe(1);
      expect(changes[0].newAction).toBe('auto');
    });

    it('prevents oscillation between auto and escalate', () => {
      // Cycle 1: set to escalate at run 1
      engine.applyPatternReport(makeReport([escalationRec('technical', 'back-1')]), 1);
      expect(engine.getPolicy('technical', 'back-1')!.action).toBe('escalate');

      // Cycle 2: try auto at run 3 — dampened
      engine.applyPatternReport(makeReport([autoRec('technical', 'back-1')]), 3);
      expect(engine.getPolicy('technical', 'back-1')!.action).toBe('escalate');

      // Cycle 3: try auto at run 6 — allowed (past dampening)
      engine.applyPatternReport(makeReport([autoRec('technical', 'back-1')]), 6);
      expect(engine.getPolicy('technical', 'back-1')!.action).toBe('auto');

      // Cycle 4: try escalate at run 8 — dampened
      engine.applyPatternReport(makeReport([escalationRec('technical', 'back-1')]), 8);
      expect(engine.getPolicy('technical', 'back-1')!.action).toBe('auto');
    });
  });

  describe('max 1 change per category per cycle', () => {
    it('only applies first recommendation for same category+agent', () => {
      const report = makeReport([
        escalationRec('technical', 'back-1'),
        autoRec('technical', 'back-1'),
      ]);
      const changes = engine.applyPatternReport(report, 10);

      expect(changes.length).toBe(1);
      expect(changes[0].newAction).toBe('escalate');
    });

    it('allows changes for different category+agent combos', () => {
      const report = makeReport([
        escalationRec('technical', 'back-1'),
        autoRec('scope', 'front-1'),
      ]);
      const changes = engine.applyPatternReport(report, 10);

      expect(changes.length).toBe(2);
    });
  });

  describe('human override', () => {
    it('skips adaptive changes when human override is set', () => {
      engine.setHumanOverride('technical', 'back-1', 'pause');

      const report = makeReport([escalationRec('technical', 'back-1')]);
      const changes = engine.applyPatternReport(report, 10);

      expect(changes.length).toBe(0);

      const policy = engine.getPolicy('technical', 'back-1');
      expect(policy!.action).toBe('pause');
      expect(policy!.humanOverride).toBe(true);
    });

    it('allows setting human override on existing adaptive policy', () => {
      engine.applyPatternReport(makeReport([escalationRec('technical', 'back-1')]), 1);
      engine.setHumanOverride('technical', 'back-1', 'auto');

      const policy = engine.getPolicy('technical', 'back-1');
      expect(policy!.action).toBe('auto');
      expect(policy!.humanOverride).toBe(true);
    });
  });

  describe('change log', () => {
    it('records all policy changes in audit log', () => {
      engine.applyPatternReport(makeReport([escalationRec('technical', 'back-1')]), 1);
      engine.applyPatternReport(makeReport([autoRec('technical', 'back-1')]), 10);

      const log = engine.getChangeLog();
      expect(log.length).toBe(2);
      expect(log[0].newAction).toBe('auto');
      expect(log[0].previousAction).toBe('escalate');
      expect(log[1].newAction).toBe('escalate');
      expect(log[1].previousAction).toBeNull();
    });

    it('includes confidence and evidence in log', () => {
      engine.applyPatternReport(makeReport([escalationRec('technical', 'back-1', 0.85)]), 1);

      const log = engine.getChangeLog();
      expect(log[0].confidence).toBe(0.85);
      expect(log[0].evidence).toContain('technical');
    });
  });

  describe('policy resolution', () => {
    const defaults: Record<string, { action: string; target?: string }> = {
      technical: { action: 'auto' },
      scope: { action: 'escalate', target: 'tech-lead' },
    };

    it('returns adaptive policy when it exists', () => {
      engine.applyPatternReport(makeReport([escalationRec('technical', 'back-1')]), 10);

      const resolved = engine.resolvePolicy('technical', 'back-1', defaults);
      expect(resolved.action).toBe('escalate');
      expect(resolved.source).toBe('adaptive');
    });

    it('falls back to default when no adaptive policy exists', () => {
      const resolved = engine.resolvePolicy('scope', 'back-1', defaults);
      expect(resolved.action).toBe('escalate');
      expect(resolved.target).toBe('tech-lead');
      expect(resolved.source).toBe('default');
    });

    it('returns auto default for unknown categories', () => {
      const resolved = engine.resolvePolicy('unknown', 'back-1', defaults);
      expect(resolved.action).toBe('auto');
      expect(resolved.source).toBe('default');
    });
  });

  describe('getAllPolicies', () => {
    it('returns all stored adaptive policies', () => {
      engine.applyPatternReport(makeReport([
        escalationRec('technical', 'back-1'),
        autoRec('scope', 'front-1'),
      ]), 10);

      const policies = engine.getAllPolicies();
      expect(policies.length).toBe(2);
    });

    it('returns empty array when no policies exist', () => {
      expect(engine.getAllPolicies()).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles recommendations with missing details gracefully', () => {
      const report = makeReport([{
        patternType: 'escalation_candidate',
        action: 'change_policy',
        details: {},
        confidence: 0.9,
      }]);
      const changes = engine.applyPatternReport(report, 10);
      expect(changes.length).toBe(0);
    });

    it('handles empty report', () => {
      const report = makeReport([]);
      const changes = engine.applyPatternReport(report, 10);
      expect(changes.length).toBe(0);
    });
  });
});
