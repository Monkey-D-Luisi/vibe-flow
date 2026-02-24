import type Database from 'better-sqlite3';
import type { TaskRecord } from '../domain/task-record.js';
import { TaskNotFoundError, ValidationError } from '../domain/errors.js';
import type { SqliteTaskRepository } from '../persistence/task-repository.js';
import type { EventLog } from './event-log.js';
import type { ValidateFn } from '../schemas/validator.js';
import {
  ROLE_OUTPUT_SCHEMAS,
  type RoleSchemaKey,
} from '../schemas/workflow-role.schema.js';
import type { WorkflowStep } from '../schemas/workflow-step-run.schema.js';

interface WorkflowCustomStepResult {
  type: 'shell' | 'script';
  command?: string;
  script?: string;
  output: Record<string, unknown>;
}

interface WorkflowMetadata extends Record<string, unknown> {
  custom_steps?: Record<string, WorkflowCustomStepResult>;
}

export interface StepExecutionResult {
  readonly stepId: string;
  readonly stepType: WorkflowStep['type'];
  readonly schemaKey: RoleSchemaKey | null;
}

export interface StepRunnerDeps {
  db: Database.Database;
  taskRepo: SqliteTaskRepository;
  eventLog: EventLog;
  validate: ValidateFn;
  now: () => string;
}

export interface StepRunnerInput {
  taskId: string;
  agentId: string;
  rev: number;
  steps: WorkflowStep[];
}

function toWorkflowMetadata(metadata: Record<string, unknown>): WorkflowMetadata {
  return { ...metadata };
}

function cloneCustomSteps(
  customSteps: WorkflowMetadata['custom_steps'],
): Record<string, WorkflowCustomStepResult> {
  if (!customSteps) {
    return {};
  }
  return { ...customSteps };
}

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export interface StepRunnerResult {
  task: TaskRecord;
  steps: StepExecutionResult[];
}

export function runWorkflowSteps(input: StepRunnerInput, deps: StepRunnerDeps): StepRunnerResult {
  const { db, taskRepo, eventLog, validate, now } = deps;

  const run = db.transaction((): StepRunnerResult => {
    const task = taskRepo.getById(input.taskId);
    if (!task) {
      throw new TaskNotFoundError(input.taskId);
    }

    const metadata = toWorkflowMetadata(task.metadata);
    const stepResults: StepExecutionResult[] = [];
    const customSteps = cloneCustomSteps(metadata.custom_steps);

    for (const step of input.steps) {
      if (step.type === 'llm-task') {
        const schema = ROLE_OUTPUT_SCHEMAS[step.schemaKey];
        try {
          metadata[step.schemaKey] = validate(schema, step.output);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          throw new ValidationError(
            `workflow step "${step.id}" failed contract "${step.schemaKey}": ${message}`,
          );
        }

        stepResults.push({
          stepId: step.id,
          stepType: step.type,
          schemaKey: step.schemaKey,
        });
        continue;
      }

      customSteps[step.id] = step.type === 'shell'
        ? {
            type: step.type,
            command: step.command,
            output: toObject(step.output),
          }
        : {
            type: step.type,
            script: step.script,
            output: toObject(step.output),
          };
      stepResults.push({
        stepId: step.id,
        stepType: step.type,
        schemaKey: null,
      });
    }

    metadata.custom_steps = customSteps;

    const updatedTask = taskRepo.update(
      task.id,
      { metadata },
      input.rev,
      now(),
    );

    for (const result of stepResults) {
      eventLog.logWorkflowStep(
        task.id,
        result.stepId,
        result.stepType,
        input.agentId,
        result.schemaKey,
      );
    }

    return {
      task: updatedTask,
      steps: stepResults,
    };
  });

  return run();
}
