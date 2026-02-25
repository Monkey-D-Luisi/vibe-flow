import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { createTaskRecord, createOrchestratorState } from '../../src/domain/task-record.js';
import { runWorkflowSteps, type StepRunnerDeps } from '../../src/orchestrator/step-runner.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { createValidator } from '../../src/schemas/validator.js';
import type { WorkflowStep } from '../../src/schemas/workflow-step-run.schema.js';

const NOW = '2026-02-24T12:00:00.000Z';
const TASK_ID = '01TASK_STEP_RUNNER_0001';

function createDeps(
  db: Database.Database,
  validate: StepRunnerDeps['validate'] = createValidator(),
): StepRunnerDeps {
  let idCounter = 0;
  const taskRepo = new SqliteTaskRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const generateId = () => `01STEP_${String(++idCounter).padStart(10, '0')}`;
  const now = () => NOW;

  return {
    db,
    taskRepo,
    eventLog: new EventLog(eventRepo, generateId, now),
    validate,
    now,
  };
}

function seedTask(
  taskRepo: SqliteTaskRepository,
  metadata: Record<string, unknown> = {},
): void {
  const task = createTaskRecord(
    {
      title: 'Step runner task',
      metadata,
    },
    TASK_ID,
    NOW,
  );
  const orchestratorState = createOrchestratorState(TASK_ID, NOW);
  taskRepo.create(task, orchestratorState);
}

describe('runWorkflowSteps', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db?.close();
  });

  it('throws when task does not exist', () => {
    const deps = createDeps(db);

    expect(() => runWorkflowSteps(
      {
        taskId: '01TASK_MISSING_0001',
        agentId: 'dev',
        rev: 0,
        steps: [
          {
            id: 'shell-1',
            type: 'shell',
            command: 'pnpm lint',
            output: { exitCode: 0 },
          },
        ],
      },
      deps,
    )).toThrow(/[Nn]ot [Ff]ound/);
  });

  it('preserves existing custom steps and normalizes non-object script output', () => {
    const deps = createDeps(db);
    seedTask(deps.taskRepo, {
      custom_steps: {
        existing: {
          type: 'shell',
          command: 'pnpm typecheck',
          output: { exitCode: 0 },
        },
      },
    });

    const result = runWorkflowSteps(
      {
        taskId: TASK_ID,
        agentId: 'dev',
        rev: 0,
        steps: [
          {
            id: 'script-1',
            type: 'script',
            script: 'scripts/check.ts',
            output: 'not-an-object',
          } as unknown as WorkflowStep,
        ],
      },
      deps,
    );

    const customSteps = result.task.metadata.custom_steps as Record<string, Record<string, unknown>>;
    expect(customSteps.existing).toBeDefined();
    expect(customSteps['script-1']).toEqual({
      type: 'script',
      script: 'scripts/check.ts',
      output: {},
    });
  });

  it('wraps non-Error validation failures with step context', () => {
    const deps = createDeps(
      db,
      (() => {
        throw 'schema exploded';
      }) as StepRunnerDeps['validate'],
    );
    seedTask(deps.taskRepo);

    expect(() => runWorkflowSteps(
      {
        taskId: TASK_ID,
        agentId: 'pm',
        rev: 0,
        steps: [
          {
            id: 'llm-1',
            type: 'llm-task',
            role: 'pm',
            schemaKey: 'po_brief',
            output: {
              title: 'task',
              acceptance_criteria: ['criterion'],
              scope: 'minor',
              done_if: ['done'],
            },
          },
        ],
      },
      deps,
    )).toThrow(/workflow step "llm-1" failed contract "po_brief": schema exploded/);
  });

  it('logs cost.llm events for llm-task steps', () => {
    const deps = createDeps(db);
    seedTask(deps.taskRepo);

    runWorkflowSteps(
      {
        taskId: TASK_ID,
        agentId: 'pm',
        rev: 0,
        steps: [
          {
            id: 'llm-1',
            type: 'llm-task',
            role: 'pm',
            schemaKey: 'po_brief',
            output: {
              title: 'task',
              acceptance_criteria: ['criterion'],
              scope: 'minor',
              done_if: ['done'],
            },
            cost: {
              model: 'mock-model',
              inputTokens: 10,
              outputTokens: 5,
              durationMs: 4,
            },
          },
        ],
      },
      deps,
    );

    const events = deps.eventLog.getHistory(TASK_ID);
    const costEvent = events.find((event) => event.eventType === 'cost.llm');
    expect(costEvent).toBeDefined();
    expect(costEvent?.payload).toMatchObject({
      model: 'mock-model',
      inputTokens: 10,
      outputTokens: 5,
      durationMs: 4,
      stepId: 'llm-1',
      schemaKey: 'po_brief',
    });
  });
});
