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
import { taskTransitionToolDef } from '../../src/tools/task-transition.js';

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

describe('task.transition tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);

    const createTool = taskCreateToolDef(deps);
    const result = await createTool.execute('c1', { title: 'Test task' });
    const { task } = result.details as { task: { id: string } };
    taskId = task.id;
  });

  afterEach(() => {
    db?.close();
  });

  it('should transition backlog -> grooming', async () => {
    const tool = taskTransitionToolDef(deps);
    const result = await tool.execute('c1', {
      id: taskId,
      toStatus: 'grooming',
      agentId: 'pm',
      rev: 0,
    });

    const details = result.details as {
      task: { status: string };
      orchestratorState: { current: string; previous: string };
      event: { eventType: string };
    };
    expect(details.task.status).toBe('grooming');
    expect(details.orchestratorState.current).toBe('grooming');
    expect(details.orchestratorState.previous).toBe('backlog');
    expect(details.event.eventType).toBe('task.transition');
  });

  it('should reject invalid transition', async () => {
    const tool = taskTransitionToolDef(deps);
    await expect(
      tool.execute('c1', {
        id: taskId,
        toStatus: 'done',
        agentId: 'pm',
        rev: 0,
      }),
    ).rejects.toThrow(/[Ii]nvalid transition/);
  });

  it('should reject non-existent task', async () => {
    const tool = taskTransitionToolDef(deps);
    await expect(
      tool.execute('c1', {
        id: 'NONEXISTENT',
        toStatus: 'grooming',
        agentId: 'pm',
        rev: 0,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('should return structured JSON content', async () => {
    const tool = taskTransitionToolDef(deps);
    const result = await tool.execute('c1', {
      id: taskId,
      toStatus: 'grooming',
      agentId: 'pm',
      rev: 0,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.task.status).toBe('grooming');
  });
});
