import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { createValidator } from '../../src/schemas/validator.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { taskCreateToolDef } from '../../src/tools/task-create.js';
import { taskUpdateToolDef } from '../../src/tools/task-update.js';

const NOW = '2026-02-24T12:00:00.000Z';

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01TOOL_${String(++idCounter).padStart(10, '0')}`;
  const now = () => NOW;
  const eventLog = new EventLog(eventRepo, generateId, now);
  return { db, taskRepo, orchestratorRepo, leaseRepo, eventLog, generateId, now, validate: createValidator() };
}

describe('task.update tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);

    const createTool = taskCreateToolDef(deps);
    const result = await createTool.execute('c1', { title: 'Original' });
    const { task } = result.details as { task: { id: string } };
    taskId = task.id;
  });

  afterEach(() => {
    db?.close();
  });

  it('should update title and increment rev', async () => {
    const updateTool = taskUpdateToolDef(deps);
    const result = await updateTool.execute('c1', {
      id: taskId,
      rev: 0,
      title: 'Updated',
    });

    const { task } = result.details as { task: { title: string; rev: number } };
    expect(task.title).toBe('Updated');
    expect(task.rev).toBe(1);
  });

  it('should reject stale rev', async () => {
    const updateTool = taskUpdateToolDef(deps);
    await updateTool.execute('c1', { id: taskId, rev: 0, title: 'V1' });

    await expect(
      updateTool.execute('c2', { id: taskId, rev: 0, title: 'V2' }),
    ).rejects.toThrow(/[Ss]tale/);
  });

  it('should log task.updated event', async () => {
    const updateTool = taskUpdateToolDef(deps);
    await updateTool.execute('c1', { id: taskId, rev: 0, title: 'Updated' });

    const events = deps.eventLog.getHistory(taskId);
    const updateEvents = events.filter((e) => e.eventType === 'task.updated');
    expect(updateEvents).toHaveLength(1);
    expect(updateEvents[0].payload).toEqual({ fields: ['title'] });
  });

  it('should reject missing rev', async () => {
    const updateTool = taskUpdateToolDef(deps);
    await expect(
      updateTool.execute('c1', { id: taskId, title: 'Updated' }),
    ).rejects.toThrow(/[Vv]alidation/);
  });
});
