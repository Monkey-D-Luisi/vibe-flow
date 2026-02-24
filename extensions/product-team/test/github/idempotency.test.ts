import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { computePayloadHash, withIdempotency } from '../../src/github/idempotency.js';
import { SqliteRequestRepository } from '../../src/persistence/request-repository.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { createTestDatabase } from '../helpers.js';
import {
  createOrchestratorState,
  createTaskRecord,
} from '../../src/domain/task-record.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('computePayloadHash', () => {
  it('should return the same hash for equivalent objects with different key order', () => {
    const hashA = computePayloadHash({
      b: 2,
      a: 1,
      nested: { y: 2, x: 1 },
    });
    const hashB = computePayloadHash({
      nested: { x: 1, y: 2 },
      a: 1,
      b: 2,
    });

    expect(hashA).toBe(hashB);
  });
});

describe('withIdempotency', () => {
  let db: Database.Database;
  let requestRepo: SqliteRequestRepository;
  let taskRepo: SqliteTaskRepository;
  let counter: number;

  beforeEach(() => {
    db = createTestDatabase();
    requestRepo = new SqliteRequestRepository(db);
    taskRepo = new SqliteTaskRepository(db);
    counter = 0;

    taskRepo.create(
      createTaskRecord({ title: 'Task' }, 'TASK-1', NOW),
      createOrchestratorState('TASK-1', NOW),
    );
  });

  afterEach(() => {
    db?.close();
  });

  it('should execute once and return cached result on duplicate payload', async () => {
    const execute = vi.fn(async () => ({ branch: 'task/TASK-1-github', sha: 'abc123' }));
    const deps = {
      requestRepo,
      generateId: () => `REQ-${++counter}`,
      now: () => NOW,
    };

    const first = await withIdempotency({
      taskId: 'TASK-1',
      tool: 'vcs.branch.create',
      payload: { taskId: 'TASK-1', slug: 'github' },
      deps,
      execute,
    });
    const second = await withIdempotency({
      taskId: 'TASK-1',
      tool: 'vcs.branch.create',
      payload: { slug: 'github', taskId: 'TASK-1' },
      deps,
      execute,
    });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(second.result).toEqual(first.result);
  });
});
