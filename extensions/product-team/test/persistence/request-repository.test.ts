import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteRequestRepository } from '../../src/persistence/request-repository.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import {
  createOrchestratorState,
  createTaskRecord,
} from '../../src/domain/task-record.js';

const NOW = '2026-02-24T12:00:00.000Z';

describe('SqliteRequestRepository', () => {
  let db: Database.Database;
  let requestRepo: SqliteRequestRepository;
  let taskRepo: SqliteTaskRepository;

  beforeEach(() => {
    db = createTestDatabase();
    requestRepo = new SqliteRequestRepository(db);
    taskRepo = new SqliteTaskRepository(db);
  });

  afterEach(() => {
    db?.close();
  });

  function seedTask(taskId: string): void {
    taskRepo.create(
      createTaskRecord({ title: `Task ${taskId}` }, taskId, NOW),
      createOrchestratorState(taskId, NOW),
    );
  }

  it('should insert and find by payload hash', () => {
    seedTask('TASK-1');

    requestRepo.insert({
      requestId: 'REQ-1',
      taskId: 'TASK-1',
      tool: 'vcs.branch.create',
      payloadHash: 'hash-1',
      response: '{"branch":"task/TASK-1-slug"}',
      createdAt: NOW,
    });

    const record = requestRepo.findByPayloadHash('vcs.branch.create', 'hash-1');
    expect(record).not.toBeNull();
    expect(record?.requestId).toBe('REQ-1');
  });

  it('should return null when no matching payload hash exists', () => {
    seedTask('TASK-2');

    const record = requestRepo.findByPayloadHash('vcs.pr.create', 'missing');
    expect(record).toBeNull();
  });

  it('should enforce unique tool + payload hash', () => {
    seedTask('TASK-3');
    seedTask('TASK-4');

    requestRepo.insert({
      requestId: 'REQ-2',
      taskId: 'TASK-3',
      tool: 'vcs.pr.create',
      payloadHash: 'same-hash',
      response: '{"number":12}',
      createdAt: NOW,
    });

    expect(() =>
      requestRepo.insert({
        requestId: 'REQ-3',
        taskId: 'TASK-4',
        tool: 'vcs.pr.create',
        payloadHash: 'same-hash',
        response: '{"number":13}',
        createdAt: NOW,
      }),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('should return latest request by task and tool', () => {
    seedTask('TASK-5');

    requestRepo.insert({
      requestId: 'REQ-4',
      taskId: 'TASK-5',
      tool: 'vcs.label.sync',
      payloadHash: 'hash-a',
      response: '{"synced":1}',
      createdAt: '2026-02-24T11:00:00.000Z',
    });
    requestRepo.insert({
      requestId: 'REQ-5',
      taskId: 'TASK-5',
      tool: 'vcs.label.sync',
      payloadHash: 'hash-b',
      response: '{"synced":2}',
      createdAt: '2026-02-24T12:00:00.000Z',
    });

    const latest = requestRepo.findLatestByTaskAndTool('TASK-5', 'vcs.label.sync');
    expect(latest).not.toBeNull();
    expect(latest?.requestId).toBe('REQ-5');
  });
});
