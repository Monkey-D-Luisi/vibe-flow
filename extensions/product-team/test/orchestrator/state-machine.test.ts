import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { transition, type TransitionDeps } from '../../src/orchestrator/state-machine.js';
import {
  createTaskRecord,
  createOrchestratorState,
} from '../../src/domain/task-record.js';
import {
  TaskNotFoundError,
  InvalidTransitionError,
  LeaseConflictError,
} from '../../src/domain/errors.js';

const NOW = '2026-02-24T12:00:00.000Z';
const TASK_ID = '01SM_TEST_0000001';

describe('state-machine transition', () => {
  let db: Database.Database;
  let taskRepo: SqliteTaskRepository;
  let orchestratorRepo: SqliteOrchestratorRepository;
  let deps: TransitionDeps;
  let currentTime: string;

  beforeEach(() => {
    db = createTestDatabase();
    taskRepo = new SqliteTaskRepository(db);
    orchestratorRepo = new SqliteOrchestratorRepository(db);
    const eventRepo = new SqliteEventRepository(db);
    const leaseRepo = new SqliteLeaseRepository(db);

    currentTime = NOW;
    let idCounter = 0;
    const generateId = () => `01EVT_SM_${String(++idCounter).padStart(7, '0')}`;

    const eventLog = new EventLog(eventRepo, generateId, () => currentTime);

    deps = {
      db,
      taskRepo,
      orchestratorRepo,
      leaseRepo,
      eventLog,
      now: () => currentTime,
    };

    // Create a task
    const task = createTaskRecord({ title: 'Test task' }, TASK_ID, NOW);
    const orchState = createOrchestratorState(TASK_ID, NOW);
    taskRepo.create(task, orchState);
  });

  afterEach(() => {
    db?.close();
  });

  describe('valid transitions', () => {
    it('should transition backlog -> grooming', () => {
      const result = transition(TASK_ID, 'grooming', 'pm', 0, deps);

      expect(result.task.status).toBe('grooming');
      expect(result.orchestratorState.current).toBe('grooming');
      expect(result.orchestratorState.previous).toBe('backlog');
      expect(result.orchestratorState.lastAgent).toBe('pm');
      expect(result.event.eventType).toBe('task.transition');
    });

    it('should transition through full lifecycle', () => {
      // backlog -> grooming
      let result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      expect(result.task.status).toBe('grooming');

      // grooming -> design
      result = transition(TASK_ID, 'design', 'architect', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('design');

      // design -> in_progress
      result = transition(TASK_ID, 'in_progress', 'dev', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('in_progress');

      // in_progress -> in_review
      result = transition(TASK_ID, 'in_review', 'dev', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('in_review');

      // in_review -> qa
      result = transition(TASK_ID, 'qa', 'reviewer', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('qa');

      // qa -> done
      result = transition(TASK_ID, 'done', 'qa', result.orchestratorState.rev, deps);
      expect(result.task.status).toBe('done');
    });

    it('should support grooming -> in_progress fast-track', () => {
      transition(TASK_ID, 'grooming', 'pm', 0, deps);

      const orchState = orchestratorRepo.getByTaskId(TASK_ID)!;
      const result = transition(
        TASK_ID,
        'in_progress',
        'dev',
        orchState.rev,
        deps,
      );
      expect(result.task.status).toBe('in_progress');
    });
  });

  describe('invalid transitions', () => {
    it('should reject invalid transition with InvalidTransitionError', () => {
      expect(() =>
        transition(TASK_ID, 'done', 'pm', 0, deps),
      ).toThrow(InvalidTransitionError);
    });

    it('should throw TaskNotFoundError for non-existent task', () => {
      expect(() =>
        transition('NONEXISTENT', 'grooming', 'pm', 0, deps),
      ).toThrow(TaskNotFoundError);
    });
  });

  describe('event logging', () => {
    it('should log transition event with from/to in payload', () => {
      const result = transition(TASK_ID, 'grooming', 'pm', 0, deps);

      expect(result.event.eventType).toBe('task.transition');
      expect(result.event.payload).toEqual({
        from: 'backlog',
        to: 'grooming',
      });
      expect(result.event.agentId).toBe('pm');
    });
  });

  describe('optimistic locking', () => {
    it('should reject stale orchestrator rev', () => {
      transition(TASK_ID, 'grooming', 'pm', 0, deps);

      // Try with stale rev=0 (should be 1 now)
      expect(() =>
        transition(TASK_ID, 'design', 'architect', 0, deps),
      ).toThrow(/[Ss]tale/);
    });
  });

  describe('review rejection counter', () => {
    it('should increment roundsReview on in_review -> in_progress', () => {
      // backlog -> grooming -> design -> in_progress -> in_review
      let result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      result = transition(TASK_ID, 'design', 'architect', result.orchestratorState.rev, deps);
      result = transition(TASK_ID, 'in_progress', 'dev', result.orchestratorState.rev, deps);
      result = transition(TASK_ID, 'in_review', 'dev', result.orchestratorState.rev, deps);

      expect(result.orchestratorState.roundsReview).toBe(0);

      // Rejection: in_review -> in_progress
      result = transition(TASK_ID, 'in_progress', 'reviewer', result.orchestratorState.rev, deps);
      expect(result.orchestratorState.roundsReview).toBe(1);
    });
  });

  describe('lease enforcement', () => {
    it('should reject transition when lease held by different agent', () => {
      // Acquire lease as pm
      deps.leaseRepo.acquire(TASK_ID, 'pm', NOW, '2026-02-24T12:05:00.000Z');

      // Try to transition as dev
      expect(() =>
        transition(TASK_ID, 'grooming', 'dev', 0, deps),
      ).toThrow(LeaseConflictError);
    });

    it('should allow transition by lease holder', () => {
      deps.leaseRepo.acquire(TASK_ID, 'pm', NOW, '2026-02-24T12:05:00.000Z');

      const result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      expect(result.task.status).toBe('grooming');
    });

    it('should allow transition when no lease exists', () => {
      const result = transition(TASK_ID, 'grooming', 'pm', 0, deps);
      expect(result.task.status).toBe('grooming');
    });
  });
});
