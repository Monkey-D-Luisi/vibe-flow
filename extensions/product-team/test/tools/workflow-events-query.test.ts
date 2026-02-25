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
import { workflowEventsQueryToolDef } from '../../src/tools/workflow-events-query.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';

const NOW = '2026-02-25T10:00:00.000Z';

function createDeps(db: Database.Database): ToolDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  const generateId = () => `01WEQ_${String(++idCounter).padStart(10, '0')}`;
  const now = () => NOW;
  return {
    db,
    taskRepo,
    orchestratorRepo,
    leaseRepo,
    eventLog: new EventLog(eventRepo, generateId, now),
    generateId,
    now,
    validate: createValidator(),
    transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
  };
}

describe('workflow.events.query tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);
    const createTool = taskCreateToolDef(deps);
    const created = await createTool.execute('create', { title: 'Events task' });
    taskId = (created.details as { task: { id: string } }).task.id;

    const transitionTool = taskTransitionToolDef(deps);
    await transitionTool.execute('tr-1', {
      id: taskId,
      toStatus: 'grooming',
      agentId: 'pm',
      rev: 0,
    });
  });

  afterEach(() => {
    db.close();
  });

  it('returns paginated events and aggregate counters', async () => {
    const tool = workflowEventsQueryToolDef(deps);
    const result = await tool.execute('query-1', {
      taskId,
      limit: 10,
      offset: 0,
    });

    const details = result.details as {
      events: Array<{ eventType: string }>;
      total: number;
      aggregates: {
        byAgent: Record<string, number>;
        byEventType: Record<string, number>;
        avgCycleTimeMs: number | null;
      };
    };
    expect(details.total).toBeGreaterThanOrEqual(2);
    expect(details.events.length).toBeGreaterThanOrEqual(2);
    expect(details.aggregates.byEventType['task.created']).toBeGreaterThanOrEqual(1);
    expect(details.aggregates.byEventType['task.transition']).toBeGreaterThanOrEqual(1);
  });
});
