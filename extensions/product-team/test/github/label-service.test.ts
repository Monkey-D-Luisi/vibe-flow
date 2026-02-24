import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteRequestRepository } from '../../src/persistence/request-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { LabelService } from '../../src/github/label-service.js';
import type { GhClient } from '../../src/github/gh-client.js';
import {
  createOrchestratorState,
  createTaskRecord,
} from '../../src/domain/task-record.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('LabelService', () => {
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

  it('should sync labels and return cached response on duplicate call', async () => {
    const ghClient = {
      syncLabel: vi.fn(async () => undefined),
    } as unknown as GhClient;

    const service = new LabelService({
      ghClient,
      requestRepo,
      eventLog: new EventLog(
        new SqliteEventRepository(db),
        () => `EVT-${++idCounter}`,
        () => NOW,
      ),
      generateId: () => `REQ-${++idCounter}`,
      now: () => NOW,
    });

    const first = await service.syncLabels({
      taskId: 'TASK-1',
      labels: [{ name: 'infra', color: 'ABCDEF', description: 'Infra changes' }],
    });
    const second = await service.syncLabels({
      taskId: 'TASK-1',
      labels: [{ name: 'infra', color: 'ABCDEF', description: 'Infra changes' }],
    });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(ghClient.syncLabel).toHaveBeenCalledTimes(1);
  });

  it('should reject invalid label color', async () => {
    const ghClient = {
      syncLabel: vi.fn(async () => undefined),
    } as unknown as GhClient;

    const service = new LabelService({
      ghClient,
      requestRepo,
      eventLog: new EventLog(
        new SqliteEventRepository(db),
        () => `EVT-${++idCounter}`,
        () => NOW,
      ),
      generateId: () => `REQ-${++idCounter}`,
      now: () => NOW,
    });

    await expect(
      service.syncLabels({
        taskId: 'TASK-1',
        labels: [{ name: 'infra', color: 'XYZ123' }],
      }),
    ).rejects.toThrow(/Invalid label color/);
  });
});
