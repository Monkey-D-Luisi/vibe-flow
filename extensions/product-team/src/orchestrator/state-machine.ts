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
  LeaseCapacityError,
  TransitionGuardError,
} from '../domain/errors.js';
import {
  evaluateTransitionGuards,
  type TransitionGuardConfig,
} from './transition-guards.js';

export interface TransitionResult {
  task: TaskRecord;
  orchestratorState: OrchestratorState;
  event: EventRecord;
  requestedToStatus: TaskStatus;
  effectiveToStatus: TaskStatus;
  fastTrack: boolean;
}

export interface TransitionDeps {
  db: Database.Database;
  taskRepo: SqliteTaskRepository;
  orchestratorRepo: SqliteOrchestratorRepository;
  leaseRepo: SqliteLeaseRepository;
  eventLog: EventLog;
  now: () => string;
  guardConfig: TransitionGuardConfig;
  concurrencyConfig?: {
    readonly maxLeasesPerAgent?: number;
    readonly maxTotalLeases?: number;
  };
}

const DEFAULT_MAX_LEASES_PER_AGENT = 3;
const DEFAULT_MAX_TOTAL_LEASES = 10;

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
  const { db, taskRepo, orchestratorRepo, leaseRepo, eventLog, now, guardConfig } = deps;
  const currentNow = now();

  const doTransition = db.transaction((): TransitionResult => {
    // Read current state inside transaction
    const task = taskRepo.getById(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const fromStatus = task.status;
    const orchState = orchestratorRepo.getByTaskId(taskId);
    if (!orchState) {
      throw new Error(`Inconsistent data: OrchestratorState not found for existing task ${taskId}`);
    }

    const shouldFastTrack =
      task.scope === 'minor'
      && fromStatus === 'grooming'
      && (toStatus === 'design' || toStatus === 'in_progress');
    const effectiveToStatus: TaskStatus = shouldFastTrack ? 'in_progress' : toStatus;

    // Validate transition
    if (!isValidTransition(fromStatus, effectiveToStatus)) {
      throw new InvalidTransitionError(taskId, fromStatus, toStatus);
    }

    // Check lease: expire stale leases first
    leaseRepo.expireStale(currentNow);
    const lease = leaseRepo.getByTaskId(taskId);
    if (lease && lease.agentId !== agentId) {
      throw new LeaseConflictError(taskId, lease.agentId);
    }
    if (!lease) {
      const maxLeasesPerAgent =
        deps.concurrencyConfig?.maxLeasesPerAgent ?? DEFAULT_MAX_LEASES_PER_AGENT;
      const maxTotalLeases =
        deps.concurrencyConfig?.maxTotalLeases ?? DEFAULT_MAX_TOTAL_LEASES;
      const activeByAgent = leaseRepo.countByAgent(agentId, currentNow);
      if (activeByAgent >= maxLeasesPerAgent) {
        throw new LeaseCapacityError(
          `Agent ${agentId} has ${activeByAgent}/${maxLeasesPerAgent} active leases. ` +
          'Release a task before transitioning another task.',
        );
      }

      const activeTotal = leaseRepo.countActive(currentNow);
      if (activeTotal >= maxTotalLeases) {
        throw new LeaseCapacityError(
          `Global lease capacity reached (${activeTotal}/${maxTotalLeases}). ` +
          'Release a task before transitioning another task.',
        );
      }
    }

    const guardFailures = evaluateTransitionGuards({
      task,
      orchestratorState: orchState,
      fromStatus,
      toStatus: effectiveToStatus,
      config: guardConfig,
    });
    if (guardFailures.length > 0) {
      throw new TransitionGuardError(
        taskId,
        fromStatus,
        effectiveToStatus,
        guardFailures.map((failure) => `${failure.field} ${failure.message}`),
      );
    }

    // Determine if this is a review rejection (in_review -> in_progress)
    const isReviewRejection =
      fromStatus === 'in_review' && effectiveToStatus === 'in_progress';

    // Update orchestrator_state with optimistic lock
    const orchFields: Partial<Pick<OrchestratorState, 'current' | 'previous' | 'lastAgent' | 'roundsReview'>> = {
      current: effectiveToStatus,
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
      { status: effectiveToStatus },
      task.rev,
      currentNow,
    );

    if (shouldFastTrack) {
      eventLog.logFastTrack(taskId, toStatus, effectiveToStatus, agentId);
    }

    // Log the transition event
    const event = eventLog.logTransition(taskId, fromStatus, effectiveToStatus, agentId);

    return {
      task: updatedTask,
      orchestratorState: updatedOrchState,
      event,
      requestedToStatus: toStatus,
      effectiveToStatus,
      fastTrack: shouldFastTrack,
    };
  });

  return doTransition();
}
