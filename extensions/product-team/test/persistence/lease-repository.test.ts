import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import {
  createTaskRecord,
  createOrchestratorState,
} from '../../src/domain/task-record.js';
import { LeaseConflictError, LeaseNotHeldError } from '../../src/domain/errors.js';

const NOW = '2026-02-24T12:00:00.000Z';
const TASK_ID = '01LEASE_TEST_001';
const TASK_ID_2 = '01LEASE_TEST_002';

describe('SqliteLeaseRepository', () => {
  let db: Database.Database;
  let leaseRepo: SqliteLeaseRepository;

  beforeEach(() => {
    db = createTestDatabase();
    leaseRepo = new SqliteLeaseRepository(db);

    // Create a task so leases FK is satisfied
    const taskRepo = new SqliteTaskRepository(db);
    const task = createTaskRecord({ title: 'Test' }, TASK_ID, NOW);
    const orchState = createOrchestratorState(TASK_ID, NOW);
    taskRepo.create(task, orchState);

    const task2 = createTaskRecord({ title: 'Test 2' }, TASK_ID_2, NOW);
    const orchState2 = createOrchestratorState(TASK_ID_2, NOW);
    taskRepo.create(task2, orchState2);
  });

  afterEach(() => {
    db?.close();
  });

  describe('acquire', () => {
    it('should acquire a lease', () => {
      const lease = leaseRepo.acquire(
        TASK_ID,
        'agent-pm',
        NOW,
        '2026-02-24T12:05:00.000Z',
      );

      expect(lease.taskId).toBe(TASK_ID);
      expect(lease.agentId).toBe('agent-pm');
      expect(lease.acquiredAt).toBe(NOW);
      expect(lease.expiresAt).toBe('2026-02-24T12:05:00.000Z');
    });

    it('should allow same agent to re-acquire', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');

      const renewed = leaseRepo.acquire(
        TASK_ID,
        'agent-pm',
        '2026-02-24T12:03:00.000Z',
        '2026-02-24T12:08:00.000Z',
      );

      expect(renewed.expiresAt).toBe('2026-02-24T12:08:00.000Z');
    });

    it('should throw LeaseConflictError when held by another agent', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');

      expect(() =>
        leaseRepo.acquire(
          TASK_ID,
          'agent-dev',
          '2026-02-24T12:01:00.000Z',
          '2026-02-24T12:06:00.000Z',
        ),
      ).toThrow(LeaseConflictError);
    });

    it('should allow acquire after expired lease is cleaned up', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');

      // Acquire after expiry time
      const lease = leaseRepo.acquire(
        TASK_ID,
        'agent-dev',
        '2026-02-24T12:06:00.000Z',
        '2026-02-24T12:11:00.000Z',
      );

      expect(lease.agentId).toBe('agent-dev');
    });
  });

  describe('release', () => {
    it('should release a held lease', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');

      leaseRepo.release(TASK_ID, 'agent-pm');

      const current = leaseRepo.getByTaskId(TASK_ID);
      expect(current).toBeNull();
    });

    it('should throw LeaseNotHeldError when released by different agent', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');

      expect(() => leaseRepo.release(TASK_ID, 'agent-dev')).toThrow(
        LeaseNotHeldError,
      );
    });

    it('should be a no-op when no lease exists', () => {
      expect(() => leaseRepo.release(TASK_ID, 'agent-pm')).not.toThrow();
    });
  });

  describe('getByTaskId', () => {
    it('should return null when no lease exists', () => {
      expect(leaseRepo.getByTaskId(TASK_ID)).toBeNull();
    });

    it('should return the active lease', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');

      const lease = leaseRepo.getByTaskId(TASK_ID);
      expect(lease).not.toBeNull();
      expect(lease!.agentId).toBe('agent-pm');
    });
  });

  describe('expireStale', () => {
    it('should remove expired leases', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');

      const count = leaseRepo.expireStale('2026-02-24T12:06:00.000Z');
      expect(count).toBe(1);

      const lease = leaseRepo.getByTaskId(TASK_ID);
      expect(lease).toBeNull();
    });

    it('should not remove non-expired leases', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');

      const count = leaseRepo.expireStale('2026-02-24T12:04:00.000Z');
      expect(count).toBe(0);

      const lease = leaseRepo.getByTaskId(TASK_ID);
      expect(lease).not.toBeNull();
    });
  });

  describe('lease counts', () => {
    it('counts active leases per agent', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');
      leaseRepo.acquire(TASK_ID_2, 'agent-pm', NOW, '2026-02-24T12:06:00.000Z');

      const active = leaseRepo.countByAgent('agent-pm', '2026-02-24T12:01:00.000Z');
      expect(active).toBe(2);
    });

    it('counts all active leases globally', () => {
      leaseRepo.acquire(TASK_ID, 'agent-pm', NOW, '2026-02-24T12:05:00.000Z');
      leaseRepo.acquire(TASK_ID_2, 'agent-dev', NOW, '2026-02-24T12:06:00.000Z');

      const active = leaseRepo.countActive('2026-02-24T12:01:00.000Z');
      expect(active).toBe(2);
    });
  });
});
