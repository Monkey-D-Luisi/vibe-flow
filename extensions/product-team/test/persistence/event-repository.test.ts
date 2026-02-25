import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import {
  createTaskRecord,
  createOrchestratorState,
} from '../../src/domain/task-record.js';

const NOW = '2026-02-24T12:00:00.000Z';
const TASK_ID = '01EVENT_TEST_0001';

describe('SqliteEventRepository', () => {
  let db: Database.Database;
  let eventRepo: SqliteEventRepository;

  beforeEach(() => {
    db = createTestDatabase();
    eventRepo = new SqliteEventRepository(db);

    // Create a task so event_log FK is satisfied
    const taskRepo = new SqliteTaskRepository(db);
    const task = createTaskRecord({ title: 'Test' }, TASK_ID, NOW);
    const orchState = createOrchestratorState(TASK_ID, NOW);
    taskRepo.create(task, orchState);
  });

  afterEach(() => {
    db?.close();
  });

  describe('append', () => {
    it('should insert an event', () => {
      eventRepo.append({
        id: '01EVT_00000000001',
        taskId: TASK_ID,
        eventType: 'task.created',
        agentId: 'pm',
        payload: { title: 'Test' },
        createdAt: NOW,
      });

      const events = eventRepo.getByTaskId(TASK_ID);
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('task.created');
      expect(events[0].agentId).toBe('pm');
      expect(events[0].payload).toEqual({ title: 'Test' });
    });

    it('should accept null agentId', () => {
      eventRepo.append({
        id: '01EVT_00000000002',
        taskId: TASK_ID,
        eventType: 'task.created',
        agentId: null,
        payload: {},
        createdAt: NOW,
      });

      const events = eventRepo.getByTaskId(TASK_ID);
      expect(events[0].agentId).toBeNull();
    });
  });

  describe('getByTaskId', () => {
    it('should return events in chronological order', () => {
      eventRepo.append({
        id: '01EVT_00000000010',
        taskId: TASK_ID,
        eventType: 'task.created',
        agentId: null,
        payload: {},
        createdAt: '2026-02-24T12:00:00.000Z',
      });

      eventRepo.append({
        id: '01EVT_00000000020',
        taskId: TASK_ID,
        eventType: 'task.transition',
        agentId: 'pm',
        payload: { from: 'backlog', to: 'grooming' },
        createdAt: '2026-02-24T12:01:00.000Z',
      });

      eventRepo.append({
        id: '01EVT_00000000030',
        taskId: TASK_ID,
        eventType: 'task.updated',
        agentId: 'pm',
        payload: { fields: ['title'] },
        createdAt: '2026-02-24T12:02:00.000Z',
      });

      const events = eventRepo.getByTaskId(TASK_ID);
      expect(events).toHaveLength(3);
      expect(events[0].eventType).toBe('task.created');
      expect(events[1].eventType).toBe('task.transition');
      expect(events[2].eventType).toBe('task.updated');
    });

    it('should return empty array for task with no events', () => {
      const events = eventRepo.getByTaskId(TASK_ID);
      expect(events).toEqual([]);
    });
  });

  describe('append-only constraint', () => {
    it('should not expose update or delete methods', () => {
      const repo = eventRepo as Record<string, unknown>;
      expect(repo['update']).toBeUndefined();
      expect(repo['delete']).toBeUndefined();
      expect(repo['remove']).toBeUndefined();
    });
  });

  describe('queryEvents', () => {
    it('should return paginated events with aggregates', () => {
      eventRepo.append({
        id: '01EVT_Q_0001',
        taskId: TASK_ID,
        eventType: 'task.created',
        agentId: 'pm',
        payload: {},
        createdAt: '2026-02-24T12:00:00.000Z',
      });
      eventRepo.append({
        id: '01EVT_Q_0002',
        taskId: TASK_ID,
        eventType: 'quality.lint',
        agentId: 'dev',
        payload: { errors: 0 },
        createdAt: '2026-02-24T12:02:00.000Z',
      });
      eventRepo.append({
        id: '01EVT_Q_0003',
        taskId: TASK_ID,
        eventType: 'task.transition',
        agentId: 'dev',
        payload: { from: 'qa', to: 'done' },
        createdAt: '2026-02-24T12:10:00.000Z',
      });

      const result = eventRepo.queryEvents({
        taskId: TASK_ID,
        limit: 2,
        offset: 0,
      });
      expect(result.events).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.aggregates.byAgent.dev).toBe(2);
      expect(result.aggregates.byEventType['task.transition']).toBe(1);
      expect(result.aggregates.avgCycleTimeMs).toBeGreaterThan(0);
    });

    it('should filter events by event type', () => {
      eventRepo.append({
        id: '01EVT_F_0001',
        taskId: TASK_ID,
        eventType: 'task.created',
        agentId: 'pm',
        payload: {},
        createdAt: '2026-02-24T12:00:00.000Z',
      });
      eventRepo.append({
        id: '01EVT_F_0002',
        taskId: TASK_ID,
        eventType: 'quality.coverage',
        agentId: 'dev',
        payload: {},
        createdAt: '2026-02-24T12:01:00.000Z',
      });

      const result = eventRepo.queryEvents({
        taskId: TASK_ID,
        eventType: 'quality.coverage',
        limit: 10,
        offset: 0,
      });
      expect(result.total).toBe(1);
      expect(result.events[0].eventType).toBe('quality.coverage');
    });
  });
});
