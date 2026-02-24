import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import {
  createTaskRecord,
  createOrchestratorState,
} from '../../src/domain/task-record.js';
import { StaleRevisionError } from '../../src/domain/errors.js';

const NOW = '2026-02-24T12:00:00.000Z';
const TASK_ID = '01ORCH_TEST_00001';

describe('SqliteOrchestratorRepository', () => {
  let db: Database.Database;
  let orchRepo: SqliteOrchestratorRepository;

  beforeEach(() => {
    db = createTestDatabase();
    orchRepo = new SqliteOrchestratorRepository(db);

    // Create a task so orchestrator_state FK is satisfied
    const taskRepo = new SqliteTaskRepository(db);
    const task = createTaskRecord({ title: 'Test' }, TASK_ID, NOW);
    const orchState = createOrchestratorState(TASK_ID, NOW);
    taskRepo.create(task, orchState);
  });

  afterEach(() => {
    db?.close();
  });

  describe('getByTaskId', () => {
    it('should return the orchestrator state', () => {
      const state = orchRepo.getByTaskId(TASK_ID);
      expect(state).not.toBeNull();
      expect(state!.taskId).toBe(TASK_ID);
      expect(state!.current).toBe('backlog');
      expect(state!.previous).toBeNull();
      expect(state!.lastAgent).toBeNull();
      expect(state!.roundsReview).toBe(0);
      expect(state!.rev).toBe(0);
    });

    it('should return null for non-existent task', () => {
      const state = orchRepo.getByTaskId('NONEXISTENT');
      expect(state).toBeNull();
    });
  });

  describe('update', () => {
    it('should update current status and increment rev', () => {
      const updated = orchRepo.update(
        TASK_ID,
        { current: 'grooming', previous: 'backlog', lastAgent: 'pm' },
        0,
        '2026-02-24T13:00:00.000Z',
      );

      expect(updated.current).toBe('grooming');
      expect(updated.previous).toBe('backlog');
      expect(updated.lastAgent).toBe('pm');
      expect(updated.rev).toBe(1);
    });

    it('should reject stale revision', () => {
      orchRepo.update(
        TASK_ID,
        { current: 'grooming' },
        0,
        NOW,
      );

      expect(() =>
        orchRepo.update(TASK_ID, { current: 'design' }, 0, NOW),
      ).toThrow(StaleRevisionError);
    });

    it('should update roundsReview', () => {
      const updated = orchRepo.update(
        TASK_ID,
        { roundsReview: 1 },
        0,
        NOW,
      );

      expect(updated.roundsReview).toBe(1);
    });
  });
});
