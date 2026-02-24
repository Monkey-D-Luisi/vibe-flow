import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import {
  createTaskRecord,
  createOrchestratorState,
} from '../../src/domain/task-record.js';
import { StaleRevisionError, TaskNotFoundError } from '../../src/domain/errors.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('SqliteTaskRepository', () => {
  let db: Database.Database;
  let taskRepo: SqliteTaskRepository;

  beforeEach(() => {
    db = createTestDatabase();
    taskRepo = new SqliteTaskRepository(db);
  });

  afterEach(() => {
    db?.close();
  });

  describe('create', () => {
    it('should insert a task record', () => {
      const task = createTaskRecord({ title: 'Test task' }, '01TEST_ID_000001', NOW);
      const orchState = createOrchestratorState('01TEST_ID_000001', NOW);

      const created = taskRepo.create(task, orchState);
      expect(created.id).toBe('01TEST_ID_000001');
      expect(created.title).toBe('Test task');
      expect(created.status).toBe('backlog');
    });

    it('should atomically create orchestrator_state', () => {
      const task = createTaskRecord({ title: 'Test task' }, '01TEST_ID_000002', NOW);
      const orchState = createOrchestratorState('01TEST_ID_000002', NOW);

      taskRepo.create(task, orchState);

      const orchRepo = new SqliteOrchestratorRepository(db);
      const state = orchRepo.getByTaskId('01TEST_ID_000002');
      expect(state).not.toBeNull();
      expect(state!.current).toBe('backlog');
      expect(state!.rev).toBe(0);
    });

    it('should store tags as JSON', () => {
      const task = createTaskRecord(
        { title: 'Tagged task', tags: ['feature', 'auth'] },
        '01TEST_ID_000003',
        NOW,
      );
      const orchState = createOrchestratorState('01TEST_ID_000003', NOW);

      taskRepo.create(task, orchState);

      const retrieved = taskRepo.getById('01TEST_ID_000003');
      expect(retrieved!.tags).toEqual(['feature', 'auth']);
    });

    it('should store metadata as JSON', () => {
      const task = createTaskRecord(
        { title: 'Meta task', metadata: { priority: 'high', estimate: 5 } },
        '01TEST_ID_000004',
        NOW,
      );
      const orchState = createOrchestratorState('01TEST_ID_000004', NOW);

      taskRepo.create(task, orchState);

      const retrieved = taskRepo.getById('01TEST_ID_000004');
      expect(retrieved!.metadata).toEqual({ priority: 'high', estimate: 5 });
    });
  });

  describe('getById', () => {
    it('should return null for non-existent task', () => {
      const result = taskRepo.getById('NONEXISTENT');
      expect(result).toBeNull();
    });

    it('should return the task record', () => {
      const task = createTaskRecord(
        { title: 'Find me', scope: 'major', assignee: 'agent-pm' },
        '01TEST_ID_000005',
        NOW,
      );
      const orchState = createOrchestratorState('01TEST_ID_000005', NOW);
      taskRepo.create(task, orchState);

      const result = taskRepo.getById('01TEST_ID_000005');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Find me');
      expect(result!.scope).toBe('major');
      expect(result!.assignee).toBe('agent-pm');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      const tasks = [
        createTaskRecord({ title: 'Task A', tags: ['feature'] }, '01SEARCH_A_000001', NOW),
        createTaskRecord(
          { title: 'Task B', assignee: 'dev', tags: ['bug'] },
          '01SEARCH_B_000002',
          NOW,
        ),
        createTaskRecord(
          { title: 'Task C', assignee: 'dev', tags: ['feature', 'auth'] },
          '01SEARCH_C_000003',
          NOW,
        ),
      ];

      for (const task of tasks) {
        const orchState = createOrchestratorState(task.id, NOW);
        taskRepo.create(task, orchState);
      }
    });

    it('should return all tasks with no filters', () => {
      const results = taskRepo.search({});
      expect(results).toHaveLength(3);
    });

    it('should filter by status', () => {
      const results = taskRepo.search({ status: 'backlog' });
      expect(results).toHaveLength(3);
    });

    it('should filter by assignee', () => {
      const results = taskRepo.search({ assignee: 'dev' });
      expect(results).toHaveLength(2);
    });

    it('should filter by tags', () => {
      const results = taskRepo.search({ tags: ['feature'] });
      expect(results).toHaveLength(2);
    });

    it('should filter by multiple tags (AND logic)', () => {
      const results = taskRepo.search({ tags: ['feature', 'auth'] });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Task C');
    });

    it('should respect limit', () => {
      const results = taskRepo.search({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should respect offset', () => {
      const results = taskRepo.search({ limit: 1, offset: 1 });
      expect(results).toHaveLength(1);
    });

    it('should return empty array for no matches', () => {
      const results = taskRepo.search({ assignee: 'nobody' });
      expect(results).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update title and increment rev', () => {
      const task = createTaskRecord({ title: 'Original' }, '01UPDATE_000001', NOW);
      const orchState = createOrchestratorState('01UPDATE_000001', NOW);
      taskRepo.create(task, orchState);

      const updated = taskRepo.update(
        '01UPDATE_000001',
        { title: 'Updated' },
        0,
        '2026-02-24T13:00:00.000Z',
      );

      expect(updated.title).toBe('Updated');
      expect(updated.rev).toBe(1);
      expect(updated.updatedAt).toBe('2026-02-24T13:00:00.000Z');
    });

    it('should reject stale revision', () => {
      const task = createTaskRecord({ title: 'Test' }, '01STALE_0000001', NOW);
      const orchState = createOrchestratorState('01STALE_0000001', NOW);
      taskRepo.create(task, orchState);

      // First update succeeds
      taskRepo.update('01STALE_0000001', { title: 'V1' }, 0, NOW);

      // Second update with stale rev should fail
      expect(() =>
        taskRepo.update('01STALE_0000001', { title: 'V2' }, 0, NOW),
      ).toThrow(StaleRevisionError);
    });

    it('should throw TaskNotFoundError for non-existent task', () => {
      expect(() =>
        taskRepo.update('NONEXISTENT', { title: 'Test' }, 0, NOW),
      ).toThrow(TaskNotFoundError);
    });

    it('should update multiple fields at once', () => {
      const task = createTaskRecord({ title: 'Test' }, '01MULTI_0000001', NOW);
      const orchState = createOrchestratorState('01MULTI_0000001', NOW);
      taskRepo.create(task, orchState);

      const updated = taskRepo.update(
        '01MULTI_0000001',
        {
          title: 'New title',
          scope: 'major',
          assignee: 'agent-dev',
          tags: ['updated'],
          metadata: { updated: true },
        },
        0,
        NOW,
      );

      expect(updated.title).toBe('New title');
      expect(updated.scope).toBe('major');
      expect(updated.assignee).toBe('agent-dev');
      expect(updated.tags).toEqual(['updated']);
      expect(updated.metadata).toEqual({ updated: true });
    });
  });
});
