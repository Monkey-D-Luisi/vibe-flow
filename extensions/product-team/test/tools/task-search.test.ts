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
import { taskSearchToolDef } from '../../src/tools/task-search.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';

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
  return {
    db,
    taskRepo,
    orchestratorRepo,
    leaseRepo,
    eventLog,
    generateId,
    now,
    validate: createValidator(),
    transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
  };
}

describe('task.search tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);

    const createTool = taskCreateToolDef(deps);
    await createTool.execute('c1', { title: 'Task A', tags: ['feature'] });
    await createTool.execute('c2', { title: 'Task B', assignee: 'dev', tags: ['bug'] });
    await createTool.execute('c3', { title: 'Task C', assignee: 'dev', tags: ['feature', 'auth'] });
  });

  afterEach(() => {
    db?.close();
  });

  it('should return all tasks with empty filters', async () => {
    const searchTool = taskSearchToolDef(deps);
    const result = await searchTool.execute('c1', {});

    const details = result.details as { tasks: unknown[]; count: number };
    expect(details.count).toBe(3);
  });

  it('should filter by assignee', async () => {
    const searchTool = taskSearchToolDef(deps);
    const result = await searchTool.execute('c1', { assignee: 'dev' });

    const details = result.details as { tasks: unknown[]; count: number };
    expect(details.count).toBe(2);
  });

  it('should filter by tags', async () => {
    const searchTool = taskSearchToolDef(deps);
    const result = await searchTool.execute('c1', { tags: ['feature'] });

    const details = result.details as { tasks: unknown[]; count: number };
    expect(details.count).toBe(2);
  });

  it('should return empty for no matches', async () => {
    const searchTool = taskSearchToolDef(deps);
    const result = await searchTool.execute('c1', { assignee: 'nobody' });

    const details = result.details as { tasks: unknown[]; count: number };
    expect(details.count).toBe(0);
  });

  it('should respect limit', async () => {
    const searchTool = taskSearchToolDef(deps);
    const result = await searchTool.execute('c1', { limit: 1 });

    const details = result.details as { tasks: unknown[]; count: number };
    expect(details.count).toBe(1);
  });
});
