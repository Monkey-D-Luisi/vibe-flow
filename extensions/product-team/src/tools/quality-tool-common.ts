import { resolve } from 'node:path';
import { ulid } from 'ulid';
import { TaskNotFoundError } from '../domain/errors.js';
import { createCorrelatedLogger } from '../logging/correlated-logger.js';
import type { TaskRecord } from '../domain/task-record.js';
import type { ToolDeps } from './index.js';
import { assertPathContained } from '@openclaw/quality-contracts/exec/spawn';

interface MinimalLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
  readonly debug?: (message: string) => void;
}

const noop = () => { };

function fallbackLogger(): MinimalLogger {
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
  };
}

export interface QualityExecutionContext {
  readonly correlationId: string;
  readonly logger: ReturnType<typeof createCorrelatedLogger>;
  readonly startedAt: number;
}

export function beginQualityExecution(
  deps: ToolDeps,
  taskId: string,
  agentId: string,
): QualityExecutionContext {
  const correlationId = ulid();
  const baseLogger = (deps.logger ?? fallbackLogger()) as MinimalLogger;
  return {
    correlationId,
    logger: createCorrelatedLogger(baseLogger, correlationId, {
      taskId,
      agentId,
    }),
    startedAt: Date.now(),
  };
}

export function resolveWorkingDir(deps: ToolDeps, workingDir?: string): string {
  const workspaceRoot = deps.workspaceDir
    ? resolve(deps.workspaceDir)
    : undefined;
  if (!workingDir) {
    return workspaceRoot ?? process.cwd();
  }
  const resolved = workspaceRoot
    ? resolve(workspaceRoot, workingDir)
    : resolve(workingDir);
  if (workspaceRoot) {
    assertPathContained(resolved, workspaceRoot);
  }
  return resolved;
}

export function getTaskOrThrow(deps: ToolDeps, taskId: string): TaskRecord {
  const task = deps.taskRepo.getById(taskId);
  if (!task) {
    throw new TaskNotFoundError(taskId);
  }
  return task;
}

export function updateTaskMetadata(
  deps: ToolDeps,
  taskId: string,
  expectedRev: number,
  metadata: Record<string, unknown>,
): TaskRecord {
  return deps.taskRepo.update(
    taskId,
    { metadata },
    expectedRev,
    deps.now(),
  );
}
