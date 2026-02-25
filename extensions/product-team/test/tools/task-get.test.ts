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
import { taskGetToolDef } from '../../src/tools/task-get.js';
import { taskCreateToolDef } from '../../src/tools/task-create.js';
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

describe('task.get tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;

  beforeEach(() => {
    db = createTestDatabase();
    deps = createDeps(db);
  });

  afterEach(() => {
    db?.close();
  });

  it('should retrieve a task by id', async () => {
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('c1', { title: 'Test task' });
    const { task } = created.details as { task: { id: string } };

    deps.eventLog.logToolCost(task.id, 'dev', {
      toolName: 'quality.tests',
      durationMs: 15,
      success: true,
    });
    deps.eventLog.logLlmCost(task.id, 'dev', {
      model: 'mock-model',
      inputTokens: 20,
      outputTokens: 10,
      durationMs: 5,
      stepId: 'step-1',
      schemaKey: 'po_brief',
    });

    const getTool = taskGetToolDef(deps);
    const result = await getTool.execute('c2', { id: task.id });

    const details = result.details as {
      task: { id: string; title: string };
      orchestratorState: { current: string };
      costSummary: { totalTokens: number; totalDurationMs: number; eventCount: number };
    };
    expect(details.task.id).toBe(task.id);
    expect(details.task.title).toBe('Test task');
    expect(details.orchestratorState.current).toBe('backlog');
    expect(details.costSummary).toEqual({
      totalTokens: 30,
      totalDurationMs: 20,
      eventCount: 2,
    });
  });

  it('should throw TaskNotFoundError for non-existent id', async () => {
    const getTool = taskGetToolDef(deps);
    await expect(getTool.execute('c1', { id: 'NONEXISTENT' })).rejects.toThrow(
      /not found/i,
    );
  });

  it('should reject missing id', async () => {
    const getTool = taskGetToolDef(deps);
    await expect(getTool.execute('c1', {})).rejects.toThrow(/[Vv]alidation/);
  });
});
