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
import { workflowStepRunToolDef } from '../../src/tools/workflow-step-run.js';
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

describe('workflow.step.run tool', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    deps = createDeps(db);

    const createTool = taskCreateToolDef(deps);
    const result = await createTool.execute('create-1', {
      title: 'Workflow task',
      scope: 'major',
    });
    taskId = (result.details as { task: { id: string } }).task.id;
  });

  afterEach(() => {
    db?.close();
  });

  it('should execute declared steps in order and store outputs in metadata', async () => {
    const tool = workflowStepRunToolDef(deps);
    const result = await tool.execute('run-1', {
      id: taskId,
      agentId: 'pm',
      rev: 0,
      steps: [
        {
          id: 'step-1',
          type: 'llm-task',
          role: 'pm',
          schemaKey: 'po_brief',
          output: {
            title: 'Workflow task',
            acceptance_criteria: ['criterion'],
            scope: 'major',
            done_if: ['all checks pass'],
          },
        },
        {
          id: 'step-2',
          type: 'shell',
          command: 'pnpm lint',
          output: {
            exitCode: 0,
          },
        },
      ],
    });

    const details = result.details as {
      task: { metadata: Record<string, unknown> };
      steps: Array<{ stepId: string }>;
      transition: unknown;
    };
    expect(details.steps.map((step) => step.stepId)).toEqual(['step-1', 'step-2']);
    expect(details.transition).toBeNull();

    const metadata = details.task.metadata;
    expect(metadata.po_brief).toBeDefined();
    expect((metadata.custom_steps as Record<string, unknown>)['step-2']).toBeDefined();
  });

  it('should halt when a role output fails schema validation', async () => {
    const tool = workflowStepRunToolDef(deps);
    await expect(
      tool.execute('run-2', {
        id: taskId,
        agentId: 'pm',
        rev: 0,
        steps: [
          {
            id: 'step-1',
            type: 'llm-task',
            role: 'pm',
            schemaKey: 'po_brief',
            output: {
              title: 'Workflow task',
              acceptance_criteria: [],
              scope: 'major',
              done_if: ['all checks pass'],
            },
          },
        ],
      }),
    ).rejects.toThrow(/[Vv]alidation/);

    const task = deps.taskRepo.getById(taskId);
    expect(task?.rev).toBe(0);
    expect(task?.metadata).toEqual({});
  });

  it('should transition when toStatus is provided with orchestrator revision', async () => {
    const transitionTool = taskTransitionToolDef(deps);
    let transitioned = await transitionTool.execute('tr-1', {
      id: taskId,
      toStatus: 'grooming',
      agentId: 'pm',
      rev: 0,
    });

    transitioned = await transitionTool.execute('tr-2', {
      id: taskId,
      toStatus: 'design',
      agentId: 'tech-lead',
      rev: (transitioned.details as { orchestratorState: { rev: number } }).orchestratorState.rev,
    });

    const currentTask = deps.taskRepo.getById(taskId);
    const currentOrch = deps.orchestratorRepo.getByTaskId(taskId);
    expect(currentTask).not.toBeNull();
    expect(currentOrch).not.toBeNull();

    const workflowTool = workflowStepRunToolDef(deps);
    const result = await workflowTool.execute('run-3', {
      id: taskId,
      agentId: 'tech-lead',
      rev: currentTask!.rev,
      orchestratorRev: currentOrch!.rev,
      toStatus: 'in_progress',
      steps: [
        {
          id: 'step-arch',
          type: 'llm-task',
          role: 'tech-lead',
          schemaKey: 'architecture_plan',
          output: {
            modules: [{ name: 'api', responsibility: 'Handle requests', dependencies: [] }],
            contracts: [{ name: 'task.create', schema: '{ id: string }', direction: 'in' }],
            patterns: ['hexagonal'],
            test_plan: [{ scenario: 'API test', type: 'unit', priority: 'high' }],
            adr_id: 'ADR-002',
          },
        },
      ],
    });

    const details = result.details as {
      transition: { task: { status: string }; fastTrack: boolean } | null;
    };
    expect(details.transition).not.toBeNull();
    expect(details.transition?.task.status).toBe('in_progress');
    expect(details.transition?.fastTrack).toBe(false);
  });

  it('should roll back metadata when transition fails due to guard failure', async () => {
    const transitionTool = taskTransitionToolDef(deps);
    let transitioned = await transitionTool.execute('tr-1', {
      id: taskId,
      toStatus: 'grooming',
      agentId: 'pm',
      rev: 0,
    });
    transitioned = await transitionTool.execute('tr-2', {
      id: taskId,
      toStatus: 'design',
      agentId: 'tech-lead',
      rev: (transitioned.details as { orchestratorState: { rev: number } }).orchestratorState.rev,
    });

    const currentTask = deps.taskRepo.getById(taskId);
    const currentOrch = deps.orchestratorRepo.getByTaskId(taskId);
    expect(currentTask).not.toBeNull();
    expect(currentOrch).not.toBeNull();
    const revBefore = currentTask!.rev;

    const workflowTool = workflowStepRunToolDef(deps);
    // architecture_plan has empty contracts → guard will block design -> in_progress
    await expect(
      workflowTool.execute('run-atomic', {
        id: taskId,
        agentId: 'tech-lead',
        rev: currentTask!.rev,
        orchestratorRev: currentOrch!.rev,
        toStatus: 'in_progress',
        steps: [
          {
            id: 'step-bad-arch',
            type: 'llm-task',
            role: 'tech-lead',
            schemaKey: 'architecture_plan',
            output: {
              modules: [{ name: 'api', responsibility: 'Handle requests', dependencies: [] }],
              contracts: [{ name: 'task.create', schema: '{ id: string }', direction: 'in' }],
              patterns: ['hexagonal'],
              test_plan: [{ scenario: 'API test', type: 'unit', priority: 'high' }],
              adr_id: '',
            },
          },
        ],
      }),
    ).rejects.toThrow();

    // Metadata must not have been persisted
    const taskAfter = deps.taskRepo.getById(taskId);
    expect(taskAfter?.rev).toBe(revBefore);
    expect(taskAfter?.metadata).toEqual({});
  });
});
