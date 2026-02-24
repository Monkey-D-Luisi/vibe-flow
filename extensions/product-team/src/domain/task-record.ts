/**
 * TaskRecord and OrchestratorState domain types and factory functions.
 */

import { TaskStatus } from './task-status.js';

export interface TaskRecord {
  readonly id: string;
  title: string;
  status: TaskStatus;
  scope: 'major' | 'minor' | 'patch';
  assignee: string | null;
  tags: readonly string[];
  metadata: Record<string, unknown>;
  readonly createdAt: string;
  updatedAt: string;
  rev: number;
}

export interface OrchestratorState {
  readonly taskId: string;
  current: TaskStatus;
  previous: TaskStatus | null;
  lastAgent: string | null;
  roundsReview: number;
  rev: number;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  scope?: 'major' | 'minor' | 'patch';
  assignee?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Create a new TaskRecord with default values.
 * Status always starts as 'backlog', rev starts at 0.
 */
export function createTaskRecord(
  input: CreateTaskInput,
  id: string,
  now: string,
): TaskRecord {
  return {
    id,
    title: input.title,
    status: TaskStatus.Backlog,
    scope: input.scope ?? 'minor',
    assignee: input.assignee ?? null,
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
    rev: 0,
  };
}

/**
 * Create a new OrchestratorState for a task.
 * Current status starts as 'backlog' with no previous state.
 */
export function createOrchestratorState(
  taskId: string,
  now: string,
): OrchestratorState {
  return {
    taskId,
    current: TaskStatus.Backlog,
    previous: null,
    lastAgent: null,
    roundsReview: 0,
    rev: 0,
    updatedAt: now,
  };
}
