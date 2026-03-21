import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { computeStageTimeline, getActivePipelineTaskIds } from '../../src/observability/timeline-utils.js';

const TEST_NOW = '2026-03-21T10:30:00.000Z';

describe('computeStageTimeline', () => {
  let db: Database.Database;

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

  it('returns empty array when no stage events exist', () => {
    const result = computeStageTimeline(db, 't1');
    expect(result).toEqual([]);
  });

  it('returns entered stage without completion', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"IMPLEMENTATION"}', ?)`,
    ).run('2026-03-21T10:00:00.000Z');

    const result = computeStageTimeline(db, 't1');
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('IMPLEMENTATION');
    expect(result[0].enteredAt).toBe('2026-03-21T10:00:00.000Z');
    expect(result[0].completedAt).toBeNull();
    expect(result[0].agentId).toBe('pm');
  });

  it('returns completed stage with duration', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"ROADMAP"}', ?)`,
    ).run('2026-03-21T09:00:00.000Z');
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e2', 't1', 'pipeline.stage.completed', 'pm', '{"stage":"ROADMAP","durationMs":3600000}', ?)`,
    ).run('2026-03-21T10:00:00.000Z');

    const result = computeStageTimeline(db, 't1');
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('ROADMAP');
    expect(result[0].enteredAt).toBe('2026-03-21T09:00:00.000Z');
    expect(result[0].completedAt).toBe('2026-03-21T10:00:00.000Z');
    expect(result[0].durationMs).toBe(3600000);
  });

  it('computes duration from timestamps when not in payload', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"QA"}', ?)`,
    ).run('2026-03-21T09:00:00.000Z');
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e2', 't1', 'pipeline.stage.completed', 'qa', '{"stage":"QA"}', ?)`,
    ).run('2026-03-21T09:30:00.000Z');

    const result = computeStageTimeline(db, 't1');
    expect(result[0].durationMs).toBe(30 * 60 * 1000); // 30 min
  });

  it('returns multiple stages in chronological order', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at) VALUES
       ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"ROADMAP"}', '2026-03-21T08:00:00.000Z'),
       ('e2', 't1', 'pipeline.stage.completed', 'pm', '{"stage":"ROADMAP","durationMs":3600000}', '2026-03-21T09:00:00.000Z'),
       ('e3', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"REFINEMENT"}', '2026-03-21T09:00:00.000Z'),
       ('e4', 't1', 'pipeline.stage.completed', 'pm', '{"stage":"REFINEMENT","durationMs":1800000}', '2026-03-21T09:30:00.000Z'),
       ('e5', 't1', 'pipeline.stage.entered', 'back-1', '{"stage":"IMPLEMENTATION"}', '2026-03-21T09:30:00.000Z')`,
    ).run();

    const result = computeStageTimeline(db, 't1');
    expect(result).toHaveLength(3);
    expect(result[0].stage).toBe('ROADMAP');
    expect(result[1].stage).toBe('REFINEMENT');
    expect(result[2].stage).toBe('IMPLEMENTATION');
    expect(result[2].completedAt).toBeNull(); // still active
  });

  it('ignores events with malformed payload', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e1', 't1', 'pipeline.stage.entered', 'pm', 'not-json', ?)`,
    ).run(TEST_NOW);

    const result = computeStageTimeline(db, 't1');
    expect(result).toHaveLength(0);
  });

  it('ignores events without stage in payload', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"noStage":true}', ?)`,
    ).run(TEST_NOW);

    const result = computeStageTimeline(db, 't1');
    expect(result).toHaveLength(0);
  });
});

describe('getActivePipelineTaskIds', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at) VALUES
       ('t1', 'Task 1', 'in_progress', 'minor', ?, ?),
       ('t2', 'Task 2', 'done', 'minor', ?, ?)`,
    ).run(TEST_NOW, TEST_NOW, TEST_NOW, TEST_NOW);
  });

  afterEach(() => {
    db?.close();
  });

  it('returns empty array when no pipeline events exist', () => {
    const result = getActivePipelineTaskIds(db);
    expect(result).toEqual([]);
  });

  it('returns task with entered but not completed-DONE events', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at)
       VALUES ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"IMPLEMENTATION"}', ?)`,
    ).run(TEST_NOW);

    const result = getActivePipelineTaskIds(db);
    expect(result).toEqual(['t1']);
  });

  it('excludes tasks whose pipeline reached DONE', () => {
    db.prepare(
      `INSERT INTO event_log (id, task_id, event_type, agent_id, payload, created_at) VALUES
       ('e1', 't1', 'pipeline.stage.entered', 'pm', '{"stage":"IMPLEMENTATION"}', ?),
       ('e2', 't2', 'pipeline.stage.entered', 'pm', '{"stage":"IMPLEMENTATION"}', ?),
       ('e3', 't2', 'pipeline.stage.completed', 'pm', '{"stage":"DONE"}', ?)`,
    ).run(TEST_NOW, TEST_NOW, TEST_NOW);

    const result = getActivePipelineTaskIds(db);
    expect(result).toEqual(['t1']); // t2 is done
  });
});
