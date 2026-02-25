import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { createValidator } from '../../src/schemas/validator.js';
import { createTaskRecord, createOrchestratorState } from '../../src/domain/task-record.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';
import type { ToolDef, ToolDeps } from '../../src/tools/index.js';
import { withCostTracking } from '../../src/tools/cost-tracking.js';

const NOW = '2026-02-24T12:00:00.000Z';
const TASK_ID = '01COST_TRACK_0001';

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01COST_EVT_${String(++idCounter).padStart(8, '0')}`;
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

function seedTask(
  deps: ToolDeps,
  metadata: Record<string, unknown> = {},
): void {
  const task = createTaskRecord(
    {
      title: 'Cost tracked task',
      metadata,
    },
    TASK_ID,
    NOW,
  );
  const orch = createOrchestratorState(TASK_ID, NOW);
  deps.taskRepo.create(task, orch);
}

describe('withCostTracking', () => {
  let db: Database.Database;
  let deps: ToolDeps;

  beforeEach(() => {
    db = createTestDatabase();
    deps = createDeps(db);
  });

  afterEach(() => {
    db?.close();
  });

  it('logs cost.tool and emits budget warnings when limits are exceeded', async () => {
    seedTask(deps, {
      budget: {
        maxDurationMs: 0,
      },
    });

    const baseTool: ToolDef = {
      name: 'quality.tests',
      label: 'Quality tests',
      description: 'fake',
      parameters: {} as ToolDef['parameters'],
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          content: [{ type: 'text', text: '{}' }],
          details: {
            task: {
              id: TASK_ID,
            },
          },
        };
      },
    };

    const wrapped = withCostTracking(baseTool, deps);
    await wrapped.execute('c1', { taskId: TASK_ID, agentId: 'dev' });

    const history = deps.eventLog.getHistory(TASK_ID);
    const costEvent = history.find((event) => event.eventType === 'cost.tool');
    const warningEvent = history.find((event) => event.eventType === 'cost.warning');
    expect(costEvent).toBeDefined();
    expect(costEvent?.payload.toolName).toBe('quality.tests');
    expect(costEvent?.payload.success).toBe(true);
    expect(warningEvent).toBeDefined();
    expect(warningEvent?.payload.kind).toBe('duration');

    const updatedTask = deps.taskRepo.getById(TASK_ID);
    const budget = updatedTask?.metadata.budget as {
      warnings?: { durationLimitExceeded?: boolean };
    };
    expect(budget.warnings?.durationLimitExceeded).toBe(true);
  });

  it('records failed executions with success=false', async () => {
    seedTask(deps);

    const baseTool: ToolDef = {
      name: 'task.update',
      label: 'Task update',
      description: 'fake',
      parameters: {} as ToolDef['parameters'],
      execute: async () => {
        throw new Error('boom');
      },
    };

    const wrapped = withCostTracking(baseTool, deps);
    await expect(
      wrapped.execute('c1', { id: TASK_ID, agentId: 'pm' }),
    ).rejects.toThrow('boom');

    const history = deps.eventLog.getHistory(TASK_ID);
    const costEvent = history.find((event) => event.eventType === 'cost.tool');
    expect(costEvent).toBeDefined();
    expect(costEvent?.payload.success).toBe(false);
  });
});
