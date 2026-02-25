import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { LeaseManager } from '../../src/orchestrator/lease-manager.js';
import {
  createTaskRecord,
  createOrchestratorState,
} from '../../src/domain/task-record.js';
import { LeaseCapacityError, LeaseConflictError } from '../../src/domain/errors.js';

const BASE_NOW = '2026-02-24T12:00:00.000Z';
const TASK_ID = '01LEASE_MGR_00001';
const TASK_ID_2 = '01LEASE_MGR_00002';

describe('LeaseManager', () => {
  let db: Database.Database;
  let leaseManager: LeaseManager;
  let eventRepo: SqliteEventRepository;
  let currentTime: string;
  let taskRepo: SqliteTaskRepository;
  let leaseRepo: SqliteLeaseRepository;
  let eventLog: EventLog;
  let now: () => string;

  function seedTask(taskId: string): void {
    const task = createTaskRecord({ title: 'Test' }, taskId, BASE_NOW);
    const orchState = createOrchestratorState(taskId, BASE_NOW);
    taskRepo.create(task, orchState);
  }

  beforeEach(() => {
    db = createTestDatabase();
    currentTime = BASE_NOW;

    taskRepo = new SqliteTaskRepository(db);
    eventRepo = new SqliteEventRepository(db);
    leaseRepo = new SqliteLeaseRepository(db);

    let idCounter = 0;
    const generateId = () => `01EVT_LM_${String(++idCounter).padStart(6, '0')}`;
    now = () => currentTime;

    eventLog = new EventLog(eventRepo, generateId, now);
    leaseManager = new LeaseManager(leaseRepo, eventLog, now);

    seedTask(TASK_ID);
    seedTask(TASK_ID_2);
  });

  afterEach(() => {
    db?.close();
  });

  describe('acquire', () => {
    it('should acquire a lease and log event', () => {
      const lease = leaseManager.acquire(TASK_ID, 'agent-pm');

      expect(lease.taskId).toBe(TASK_ID);
      expect(lease.agentId).toBe('agent-pm');

      const events = eventRepo.getByTaskId(TASK_ID);
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('lease.acquired');
    });

    it('should use default 5-minute duration', () => {
      const lease = leaseManager.acquire(TASK_ID, 'agent-pm');

      const acquired = new Date(lease.acquiredAt).getTime();
      const expires = new Date(lease.expiresAt).getTime();
      expect(expires - acquired).toBe(300_000);
    });

    it('should accept custom duration', () => {
      const lease = leaseManager.acquire(TASK_ID, 'agent-pm', 60_000);

      const acquired = new Date(lease.acquiredAt).getTime();
      const expires = new Date(lease.expiresAt).getTime();
      expect(expires - acquired).toBe(60_000);
    });

    it('should throw LeaseConflictError when held by another agent', () => {
      leaseManager.acquire(TASK_ID, 'agent-pm');

      expect(() =>
        leaseManager.acquire(TASK_ID, 'agent-dev'),
      ).toThrow(LeaseConflictError);
    });
  });

  describe('release', () => {
    it('should release a lease and log event', () => {
      leaseManager.acquire(TASK_ID, 'agent-pm');
      leaseManager.release(TASK_ID, 'agent-pm');

      const lease = leaseManager.getByTaskId(TASK_ID);
      expect(lease).toBeNull();

      const events = eventRepo.getByTaskId(TASK_ID);
      expect(events).toHaveLength(2);
      expect(events[1].eventType).toBe('lease.released');
    });
  });

  describe('isHeldBy', () => {
    it('should return true for the holder', () => {
      leaseManager.acquire(TASK_ID, 'agent-pm');
      expect(leaseManager.isHeldBy(TASK_ID, 'agent-pm')).toBe(true);
    });

    it('should return false for a different agent', () => {
      leaseManager.acquire(TASK_ID, 'agent-pm');
      expect(leaseManager.isHeldBy(TASK_ID, 'agent-dev')).toBe(false);
    });

    it('should return false when no lease exists', () => {
      expect(leaseManager.isHeldBy(TASK_ID, 'agent-pm')).toBe(false);
    });

    it('should return false after lease expires', () => {
      leaseManager.acquire(TASK_ID, 'agent-pm', 60_000);

      // Advance time past expiry
      currentTime = '2026-02-24T12:02:00.000Z';
      expect(leaseManager.isHeldBy(TASK_ID, 'agent-pm')).toBe(false);
    });
  });

  describe('capacity limits', () => {
    it('enforces maxLeasesPerAgent', () => {
      leaseManager = new LeaseManager(leaseRepo, eventLog, now, 300_000, {
        maxLeasesPerAgent: 1,
        maxTotalLeases: 10,
      });

      leaseManager.acquire(TASK_ID, 'agent-pm');
      expect(() => leaseManager.acquire(TASK_ID_2, 'agent-pm')).toThrow(
        LeaseCapacityError,
      );
    });

    it('enforces maxTotalLeases', () => {
      leaseManager = new LeaseManager(leaseRepo, eventLog, now, 300_000, {
        maxLeasesPerAgent: 10,
        maxTotalLeases: 1,
      });

      leaseManager.acquire(TASK_ID, 'agent-pm');
      expect(() => leaseManager.acquire(TASK_ID_2, 'agent-dev')).toThrow(
        LeaseCapacityError,
      );
    });
  });
});
