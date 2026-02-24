import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteRequestRepository } from '../../src/persistence/request-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { PrService } from '../../src/github/pr-service.js';
import type { GhClient } from '../../src/github/gh-client.js';
import {
  createOrchestratorState,
  createTaskRecord,
} from '../../src/domain/task-record.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('PrService', () => {
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
      createTaskRecord(
        { title: 'Task one', metadata: { acceptance_criteria: ['works'] } },
        'TASK-1',
        NOW,
      ),
      createOrchestratorState('TASK-1', NOW),
    );

    requestRepo.insert({
      requestId: 'REQ-BRANCH-1',
      taskId: 'TASK-1',
      tool: 'vcs.branch.create',
      payloadHash: 'branch-hash',
      response: '{"branch":"task/TASK-1-feature","base":"main","sha":"abc","cached":false,"created":true}',
      createdAt: NOW,
    });
  });

  afterEach(() => {
    db?.close();
  });

  it('should create PR and return cached result on duplicate calls', async () => {
    const ghClient = {
      createPr: vi.fn(async () => ({
        number: 10,
        url: 'https://example/pr/10',
        title: 'Task PR',
      })),
      updatePr: vi.fn(),
    } as unknown as GhClient;

    const service = new PrService({
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

    const first = await service.createTaskPr({
      taskId: 'TASK-1',
      title: 'Task PR',
      body: 'Body',
      labels: ['infra'],
    });
    const second = await service.createTaskPr({
      taskId: 'TASK-1',
      title: 'Task PR',
      body: 'Body',
      labels: ['infra'],
    });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.head).toBe('task/TASK-1-feature');
    expect(ghClient.createPr).toHaveBeenCalledTimes(1);
  });

  it('should update a PR and log vcs.pr.update event', async () => {
    const ghClient = {
      createPr: vi.fn(),
      updatePr: vi.fn(async () => ({
        number: 10,
        url: 'https://example/pr/10',
        title: 'Updated title',
        state: 'OPEN',
      })),
    } as unknown as GhClient;

    const service = new PrService({
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

    const result = await service.updateTaskPr({
      taskId: 'TASK-1',
      prNumber: 10,
      title: 'Updated title',
    });

    expect(result).toMatchObject({
      number: 10,
      title: 'Updated title',
      cached: false,
    });

    const events = db
      .prepare('SELECT event_type FROM event_log WHERE task_id = ? ORDER BY created_at')
      .all('TASK-1') as Array<{ event_type: string }>;
    expect(events.some((event) => event.event_type === 'vcs.pr.update')).toBe(true);
  });

  it('should reject updates without any fields', async () => {
    const ghClient = {
      createPr: vi.fn(),
      updatePr: vi.fn(),
    } as unknown as GhClient;

    const service = new PrService({
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
      service.updateTaskPr({
        taskId: 'TASK-1',
        prNumber: 10,
      }),
    ).rejects.toThrow(/requires at least one field/);
  });
});
