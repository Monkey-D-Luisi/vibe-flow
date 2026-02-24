import type Database from 'better-sqlite3';
import type { TaskRecord, OrchestratorState } from '../domain/task-record.js';
import type { EventRecord } from '../persistence/event-repository.js';
import type { SqliteTaskRepository } from '../persistence/task-repository.js';
import type { SqliteOrchestratorRepository } from '../persistence/orchestrator-repository.js';
import type { SqliteLeaseRepository } from '../persistence/lease-repository.js';
import type { EventLog } from './event-log.js';
import { type TaskStatus, isValidTransition } from '../domain/task-status.js';
import {
  TaskNotFoundError,
  InvalidTransitionError,
  LeaseConflictError,
} from '../domain/errors.js';

export interface TransitionResult {
  task: TaskRecord;
  orchestratorState: OrchestratorState;
  event: EventRecord;
}

export interface TransitionDeps {
  db: Database.Database;
  taskRepo: SqliteTaskRepository;
  orchestratorRepo: SqliteOrchestratorRepository;
  leaseRepo: SqliteLeaseRepository;
  eventLog: EventLog;
  now: () => string;
}

/**
 * Execute a state transition for a task.
 *
 * Validates the transition, checks lease ownership, updates both
 * task_records and orchestrator_state, and logs the transition event.
 * All reads and mutations are wrapped in a single SQLite transaction
 * to prevent TOCTOU race conditions.
 */
export function transition(
  taskId: string,
  toStatus: TaskStatus,
  agentId: string,
  orchestratorRev: number,
  deps: TransitionDeps,
): TransitionResult {
  const { db, taskRepo, orchestratorRepo, leaseRepo, eventLog, now } = deps;
  const currentNow = now();

  const doTransition = db.transaction((): TransitionResult => {
    // Read current state inside transaction
    const task = taskRepo.getById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const fromStatus = task.status;

    // Validate transition
    if (!isValidTransition(fromStatus, toStatus)) {
      throw new InvalidTransitionError(taskId, fromStatus, toStatus);
    }

    // Check lease: expire stale leases first
    leaseRepo.expireStale(currentNow);
    const lease = leaseRepo.getByTaskId(taskId);
    if (lease && lease.agentId !== agentId) {
      throw new LeaseConflictError(taskId, lease.agentId);
    }

    // Determine if this is a review rejection (in_review -> in_progress)
    const orchState = orchestratorRepo.getByTaskId(taskId);
    if (!orchState) {
      throw new Error(`Inconsistent data: OrchestratorState not found for existing task ${taskId}`);
    }
    const isReviewRejection =
      fromStatus === 'in_review' && toStatus === 'in_progress';

    // Update orchestrator_state with optimistic lock
    const orchFields: Partial<Pick<OrchestratorState, 'current' | 'previous' | 'lastAgent' | 'roundsReview'>> = {
      current: toStatus,
      previous: fromStatus,
      lastAgent: agentId,
    };

    if (isReviewRejection) {
      orchFields.roundsReview = orchState.roundsReview + 1;
    }

    const updatedOrchState = orchestratorRepo.update(
      taskId,
      orchFields,
      orchestratorRev,
      currentNow,
    );

    // Mirror status to task_records
    const updatedTask = taskRepo.update(
      taskId,
      { status: toStatus },
      task.rev,
      currentNow,
    );

    // Log the transition event
    const event = eventLog.logTransition(taskId, fromStatus, toStatus, agentId);

    return { task: updatedTask, orchestratorState: updatedOrchState, event };
  });

  return doTransition();
}
