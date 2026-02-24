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
import { workflowStateGetToolDef } from '../../src/tools/workflow-state-get.js';
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

describe('workflow.state.get tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);

    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('c1', { title: 'State task' });
    taskId = (created.details as { task: { id: string } }).task.id;

    const transitionTool = taskTransitionToolDef(deps);
    await transitionTool.execute('t1', {
      id: taskId,
      toStatus: 'grooming',
      agentId: 'pm',
      rev: 0,
    });
  });

  afterEach(() => {
    db?.close();
  });

  it('should return workflow state and guard matrix', async () => {
    const tool = workflowStateGetToolDef(deps);
    const result = await tool.execute('s1', { id: taskId });

    const details = result.details as {
      task: { id: string };
      orchestratorState: { current: string };
      history: Array<{ eventType: string }>;
      transitionGuards: {
        matrix: unknown[];
        config: { coverageByScope: { major: number } };
      };
    };

    expect(details.task.id).toBe(taskId);
    expect(details.orchestratorState.current).toBe('grooming');
    expect(details.history.length).toBeGreaterThan(0);
    expect(details.history.some((event) => event.eventType === 'task.created')).toBe(true);
    expect(details.transitionGuards.matrix.length).toBeGreaterThan(0);
    expect(details.transitionGuards.config.coverageByScope.major).toBe(80);
  });

  it('should fail for unknown task id', async () => {
    const tool = workflowStateGetToolDef(deps);
    await expect(tool.execute('s2', { id: 'UNKNOWN' })).rejects.toThrow(/not found/i);
  });
});
