import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { TemplateDetector, extractSkeleton } from '../../src/orchestrator/template-detector.js';

const NOW = '2026-03-09T12:00:00.000Z';
const TASK_ID = 'TASK-001';

function ensureTaskRecord(db: Database.Database, taskId: string = TASK_ID): void {
  db.prepare(`
    INSERT OR IGNORE INTO task_records (id, title, status, scope, created_at, updated_at, rev)
    VALUES (?, 'Test Task', 'in_progress', 'minor', ?, ?, 1)
  `).run(taskId, NOW, NOW);
}

function insertStepEvent(db: Database.Database, overrides: {
  agentId: string;
  stepType: string;
  schemaKey: string;
  payload?: Record<string, unknown>;
  taskId?: string;
  createdAt?: string;
}): void {
  const id = `ev-${Math.random().toString(36).slice(2, 10)}`;
  const fullPayload = {
    stepId: `step-${id}`,
    stepType: overrides.stepType,
    schemaKey: overrides.schemaKey,
    ...(overrides.payload ?? {}),
  };
  db.prepare(`
    INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
    VALUES (?, ?, 'workflow.step.completed', ?, ?, ?)
  `).run(
    id,
    overrides.taskId ?? TASK_ID,
    overrides.agentId,
    JSON.stringify(fullPayload),
    overrides.createdAt ?? NOW,
  );
}

describe('TemplateDetector', () => {
  let db: Database.Database;
  let idCounter: number;
  let detector: TemplateDetector;

  beforeEach(() => {
    db = createTestDatabase();
    ensureTaskRecord(db);
    idCounter = 0;
    detector = new TemplateDetector(
      db,
      () => `TD_${String(++idCounter).padStart(10, '0')}`,
      () => NOW,
      { minSamples: 3, matchThreshold: 0.8, expiryRuns: 20, lastN: 20 },
    );
  });

  afterEach(() => {
    db?.close();
  });

  describe('extractSkeleton', () => {
    it('extracts structural skeleton from JSON payload', () => {
      const payload = JSON.stringify({
        stepId: 'step-1',
        stepType: 'llm-task',
        schemaKey: 'po_brief',
        result: { title: 'Some title', priority: 3, tags: ['a', 'b'] },
      });

      const skeleton = extractSkeleton(payload);
      const parsed = JSON.parse(skeleton) as Record<string, unknown>;

      expect(parsed).toHaveProperty('result');
      const result = parsed.result as Record<string, unknown>;
      expect(result.title).toBe('<string>');
      expect(result.priority).toBe('<number>');
      expect(result.tags).toEqual(['<string>']);
    });

    it('handles empty objects', () => {
      expect(extractSkeleton('{}')).toBe('{}');
    });

    it('handles invalid JSON', () => {
      expect(extractSkeleton('not json')).toBe('{}');
    });

    it('handles arrays', () => {
      const payload = JSON.stringify([1, 2, 3]);
      const skeleton = extractSkeleton(payload);
      expect(JSON.parse(skeleton)).toEqual(['<number>']);
    });

    it('handles nested objects', () => {
      const payload = JSON.stringify({
        a: { b: { c: 'deep' } },
      });
      const skeleton = extractSkeleton(payload);
      const parsed = JSON.parse(skeleton) as Record<string, unknown>;
      expect((parsed.a as Record<string, unknown>).b).toEqual({ c: '<string>' });
    });

    it('handles null values', () => {
      const payload = JSON.stringify({ key: null });
      const skeleton = extractSkeleton(payload);
      expect(JSON.parse(skeleton)).toEqual({ key: '<null>' });
    });

    it('handles booleans', () => {
      const payload = JSON.stringify({ flag: true });
      const skeleton = extractSkeleton(payload);
      expect(JSON.parse(skeleton)).toEqual({ flag: '<boolean>' });
    });
  });

  describe('detectTemplates', () => {
    it('detects template when outputs share the same structure', () => {
      const commonPayload = { result: { title: '', priority: 0, tags: [''] } };

      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}`, priority: i, tags: [`tag-${i}`] } },
        });
      }

      const templates = detector.detectTemplates();
      expect(templates.length).toBe(1);
      expect(templates[0].agentId).toBe('po');
      expect(templates[0].stage).toBe('llm-task');
      expect(templates[0].schemaKey).toBe('po_brief');
      expect(templates[0].matchRatio).toBe(1.0);
      expect(templates[0].version).toBe(1);
    });

    it('does not detect template below minSamples', () => {
      for (let i = 0; i < 2; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
        });
      }

      const templates = detector.detectTemplates();
      expect(templates.length).toBe(0);
    });

    it('does not detect template below match threshold', () => {
      // 5 samples: 2 same structure, 3 different
      for (let i = 0; i < 2; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: 'same' } },
        });
      }
      for (let i = 0; i < 3; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { differentKey: i, nested: { deep: true } },
        });
      }

      const templates = detector.detectTemplates();
      // The 3-count group has 60% match, below 80% threshold
      // But it IS the dominant one, let's check
      // 3/5 = 60% < 80%, so no template should be detected
      expect(templates.length).toBe(0);
    });

    it('detects templates across multiple agent/stage/schema combos', () => {
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
        });
      }
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'tech-lead',
          stepType: 'llm-task',
          schemaKey: 'architecture_plan',
          payload: { plan: { components: [`c-${i}`], decisions: [`d-${i}`] } },
        });
      }

      const templates = detector.detectTemplates();
      expect(templates.length).toBe(2);
    });
  });

  describe('getTemplate', () => {
    it('retrieves stored template', () => {
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
        });
      }

      detector.detectTemplates();
      const template = detector.getTemplate('po', 'llm-task', 'po_brief');

      expect(template).not.toBeNull();
      expect(template!.agentId).toBe('po');
      expect(template!.skeleton).toContain('<string>');
    });

    it('returns null for non-existent template', () => {
      expect(detector.getTemplate('unknown', 'unknown', 'unknown')).toBeNull();
    });
  });

  describe('template versioning', () => {
    it('increments version when skeleton changes', () => {
      // First round: structure A
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
          createdAt: `2026-03-01T${String(i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      detector.detectTemplates();
      const v1 = detector.getTemplate('po', 'llm-task', 'po_brief');
      expect(v1!.version).toBe(1);

      // Clear old events, insert new structure
      db.exec("DELETE FROM event_log WHERE event_type = 'workflow.step.completed'");
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { newResult: { name: `Name ${i}`, count: i } },
          createdAt: `2026-03-09T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        });
      }

      detector.detectTemplates();
      const v2 = detector.getTemplate('po', 'llm-task', 'po_brief');
      expect(v2!.version).toBe(2);
    });

    it('keeps same version when skeleton is unchanged', () => {
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
        });
      }

      detector.detectTemplates();
      detector.detectTemplates();

      const template = detector.getTemplate('po', 'llm-task', 'po_brief');
      expect(template!.version).toBe(1);
    });
  });

  describe('markUsed', () => {
    it('updates lastUsedRun when template is used', () => {
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
        });
      }

      const templates = detector.detectTemplates();
      expect(templates[0].lastUsedRun).toBe(0);

      detector.markUsed(templates[0].id, 15);

      const updated = detector.getTemplate('po', 'llm-task', 'po_brief');
      expect(updated!.lastUsedRun).toBe(15);
    });
  });

  describe('expireStale', () => {
    it('removes templates not used within expiry window', () => {
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
        });
      }

      detector.detectTemplates();
      // Template lastUsedRun = 0; current run = 25; expiry = 20
      // 25 - 20 = 5 > 0, so template should expire
      const expired = detector.expireStale(25);

      expect(expired.length).toBe(1);
      expect(detector.getTemplate('po', 'llm-task', 'po_brief')).toBeNull();
    });

    it('preserves recently used templates', () => {
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
        });
      }

      const templates = detector.detectTemplates();
      detector.markUsed(templates[0].id, 20);

      const expired = detector.expireStale(25);
      expect(expired.length).toBe(0);
      expect(detector.getTemplate('po', 'llm-task', 'po_brief')).not.toBeNull();
    });
  });

  describe('formatAsPromptPrefix', () => {
    it('formats template as a prompt prefix string', () => {
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
        });
      }

      const templates = detector.detectTemplates();
      const prefix = detector.formatAsPromptPrefix(templates[0]);

      expect(prefix).toContain('Based on prior successful outputs');
      expect(prefix).toContain('```json');
      expect(prefix).toContain('Template v1');
      expect(prefix).toContain('100% match rate');
    });
  });

  describe('getAllTemplates', () => {
    it('returns all stored templates', () => {
      for (let i = 0; i < 5; i++) {
        insertStepEvent(db, {
          agentId: 'po',
          stepType: 'llm-task',
          schemaKey: 'po_brief',
          payload: { result: { title: `Title ${i}` } },
        });
        insertStepEvent(db, {
          agentId: 'tech-lead',
          stepType: 'llm-task',
          schemaKey: 'architecture_plan',
          payload: { plan: { components: [`c-${i}`] } },
        });
      }

      detector.detectTemplates();
      const all = detector.getAllTemplates();
      expect(all.length).toBe(2);
    });

    it('returns empty when no templates exist', () => {
      expect(detector.getAllTemplates()).toEqual([]);
    });
  });

  describe('empty database', () => {
    it('returns empty templates when no events exist', () => {
      const templates = detector.detectTemplates();
      expect(templates).toEqual([]);
    });
  });
});
