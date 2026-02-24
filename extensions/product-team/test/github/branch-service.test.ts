import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteRequestRepository } from '../../src/persistence/request-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { BranchService } from '../../src/github/branch-service.js';
import type { GhClient } from '../../src/github/gh-client.js';
import {
  createOrchestratorState,
  createTaskRecord,
} from '../../src/domain/task-record.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('BranchService', () => {
  let db: Database.Database;
  let requestRepo: SqliteRequestRepository;
  let taskRepo: SqliteTaskRepository;
  let idCounter: number;

  beforeEach(() => {
    db = createTestDatabase();
    requestRepo = new SqliteRequestRepository(db);
    taskRepo = new SqliteTaskRepository(db);
    idCounter = 0;

    taskRepo.create(
      createTaskRecord({ title: 'Task one' }, 'TASK-1', NOW),
      createOrchestratorState('TASK-1', NOW),
    );
  });

  afterEach(() => {
    db?.close();
  });

  it('should create a task branch and log vcs.branch.create event', async () => {
    const ghClient = {
      getBranchSha: vi.fn(async () => 'base-sha'),
      createBranch: vi.fn(async () => ({
        ref: 'refs/heads/task/TASK-1-feature',
        sha: 'new-sha',
      })),
    } as unknown as GhClient;

    const service = new BranchService({
      ghClient,
      requestRepo,
      eventLog: new EventLog(
        new SqliteEventRepository(db),
        () => `EVT-${++idCounter}`,
        () => NOW,
      ),
      generateId: () => `REQ-${++idCounter}`,
      now: () => NOW,
      defaultBase: 'main',
    });

    const result = await service.createTaskBranch({
      taskId: 'TASK-1',
      slug: 'feature',
    });

    expect(result).toMatchObject({
      branch: 'task/TASK-1-feature',
      sha: 'new-sha',
      created: true,
      cached: false,
    });

    const events = db
      .prepare('SELECT event_type, payload FROM event_log WHERE task_id = ?')
      .all('TASK-1') as Array<{ event_type: string; payload: string }>;
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('vcs.branch.create');
  });

  it('should return cached response on duplicate call', async () => {
    const ghClient = {
      getBranchSha: vi.fn(async () => 'base-sha'),
      createBranch: vi.fn(async () => ({
        ref: 'refs/heads/task/TASK-1-feature',
        sha: 'new-sha',
      })),
    } as unknown as GhClient;

    const service = new BranchService({
      ghClient,
      requestRepo,
      eventLog: new EventLog(
        new SqliteEventRepository(db),
        () => `EVT-${++idCounter}`,
        () => NOW,
      ),
      generateId: () => `REQ-${++idCounter}`,
      now: () => NOW,
      defaultBase: 'main',
    });

    await service.createTaskBranch({ taskId: 'TASK-1', slug: 'feature' });
    const second = await service.createTaskBranch({ taskId: 'TASK-1', slug: 'feature' });

    expect(second.cached).toBe(true);
    expect(second.created).toBe(false);
    expect(ghClient.createBranch).toHaveBeenCalledTimes(1);
  });

  it('should reject invalid branch names', async () => {
    const ghClient = {
      getBranchSha: vi.fn(async () => 'base-sha'),
      createBranch: vi.fn(async () => ({
        ref: 'refs/heads/task/TASK 1-feature',
        sha: 'new-sha',
      })),
    } as unknown as GhClient;

    const service = new BranchService({
      ghClient,
      requestRepo,
      eventLog: new EventLog(
        new SqliteEventRepository(db),
        () => `EVT-${++idCounter}`,
        () => NOW,
      ),
      generateId: () => `REQ-${++idCounter}`,
      now: () => NOW,
      defaultBase: 'main',
    });

    await expect(
      service.createTaskBranch({
        taskId: 'TASK 1',
        slug: 'feature',
      }),
    ).rejects.toThrow(/Invalid branch/);
  });
});
