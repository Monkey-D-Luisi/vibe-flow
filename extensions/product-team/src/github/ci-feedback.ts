import type { TaskStatus } from '../domain/task-status.js';
import { StaleRevisionError } from '../domain/errors.js';
import type { GhClient } from './gh-client.js';
import { withIdempotency } from './idempotency.js';
import type { EventLog } from '../orchestrator/event-log.js';
import type { LeaseManager } from '../orchestrator/lease-manager.js';
import { transition, type TransitionDeps } from '../orchestrator/state-machine.js';
import type { SqliteOrchestratorRepository } from '../persistence/orchestrator-repository.js';
import type { SqliteRequestRepository } from '../persistence/request-repository.js';
import type { SqliteTaskRepository } from '../persistence/task-repository.js';
import {
  buildCiStatusComment,
  buildTaskIdCandidatesFromBranch,
  normalizeGithubCiEvent,
  type NormalizedGithubCiEvent,
} from './ci-feedback-utils.js';

export {
  buildCiStatusComment,
  buildTaskIdCandidatesFromBranch,
  normalizeGithubCiEvent,
  readJsonRequestBody,
  type NormalizedGithubCiEvent,
} from './ci-feedback-utils.js';

type Logger = {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
};

interface RecordValue {
  [key: string]: unknown;
}

export interface CiAutoTransitionConfig {
  readonly enabled: boolean;
  readonly toStatus: TaskStatus | null;
  readonly agentId: string;
}

export interface CiFeedbackConfig {
  readonly enabled: boolean;
  readonly routePath: string;
  readonly commentOnPr: boolean;
  readonly autoTransition: CiAutoTransitionConfig;
}

export interface CiFeedbackDeps {
  readonly taskRepo: SqliteTaskRepository;
  readonly orchestratorRepo: SqliteOrchestratorRepository;
  readonly leaseManager: LeaseManager;
  readonly requestRepo: SqliteRequestRepository;
  readonly eventLog: EventLog;
  readonly ghClient: GhClient;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly transitionDeps: TransitionDeps;
  readonly logger: Logger;
  readonly config: CiFeedbackConfig;
}

export interface CiWebhookInput {
  readonly eventName: string;
  readonly deliveryId: string | null;
  readonly payload: Record<string, unknown>;
}

export interface CiTransitionResult {
  readonly attempted: boolean;
  readonly transitioned: boolean;
  readonly toStatus?: TaskStatus;
  readonly reason?: string;
}

export interface CiWebhookResult {
  readonly handled: boolean;
  readonly cached: boolean;
  readonly taskId?: string;
  readonly commentPosted?: boolean;
  readonly transition?: CiTransitionResult;
  readonly reason?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function isSuccessConclusion(value: string | null): boolean {
  return value === 'success';
}

export class CiFeedbackAutomation {
  constructor(private readonly deps: CiFeedbackDeps) {}

  private resolveTaskIdFromBranch(branch: string | null): string | null {
    if (!branch) {
      return null;
    }
    for (const candidate of buildTaskIdCandidatesFromBranch(branch)) {
      if (this.deps.taskRepo.getById(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private mergeCiMetadata(
    metadata: Record<string, unknown>,
    event: NormalizedGithubCiEvent,
    deliveryId: string | null,
    timestamp: string,
  ): Record<string, unknown> {
    const nextMetadata: Record<string, unknown> = { ...metadata };
    const existingCi = asRecord(nextMetadata.ci) ?? {};
    const existingChecks = asRecord(existingCi.checks) ?? {};
    const checks: Record<string, unknown> = { ...existingChecks };

    for (const check of event.checks) {
      checks[check.name] = {
        status: check.status,
        conclusion: check.conclusion,
        detailsUrl: check.detailsUrl,
        updatedAt: timestamp,
      };
    }

    const existingHistory = Array.isArray(existingCi.history)
      ? existingCi.history.filter((item): item is RecordValue => asRecord(item) !== null)
      : [];
    const nextHistory = [
      ...existingHistory.slice(-19),
      {
        deliveryId,
        eventName: event.eventName,
        action: event.action,
        branch: event.branch,
        prNumber: event.prNumber,
        conclusion: event.overallConclusion,
        status: event.overallStatus,
        runUrl: event.runUrl,
        checks: event.checks.map((check) => ({
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
        })),
        processedAt: timestamp,
      },
    ];

    nextMetadata.ci = {
      ...existingCi,
      source: event.source,
      repository: event.repository,
      branch: event.branch,
      prNumber: event.prNumber ?? existingCi.prNumber ?? null,
      lastEventName: event.eventName,
      lastAction: event.action,
      lastStatus: event.overallStatus,
      lastConclusion: event.overallConclusion,
      runUrl: event.runUrl,
      lastDeliveryId: deliveryId,
      updatedAt: timestamp,
      checks,
      history: nextHistory,
    };
    return nextMetadata;
  }

  private updateTaskMetadataWithRetry(
    taskId: string,
    event: NormalizedGithubCiEvent,
    deliveryId: string | null,
  ): void {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const task = this.deps.taskRepo.getById(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found while processing CI feedback`);
      }

      const timestamp = this.deps.now();
      const nextMetadata = this.mergeCiMetadata(task.metadata, event, deliveryId, timestamp);
      try {
        this.deps.taskRepo.update(
          taskId,
          { metadata: nextMetadata },
          task.rev,
          timestamp,
        );
        return;
      } catch (error: unknown) {
        if (!(error instanceof StaleRevisionError)) {
          throw error;
        }
      }
    }

    throw new Error(`Failed to update task ${taskId} metadata after optimistic lock retries`);
  }

  private tryAutoTransition(
    taskId: string,
    event: NormalizedGithubCiEvent,
  ): CiTransitionResult {
    if (!this.deps.config.autoTransition.enabled) {
      return {
        attempted: false,
        transitioned: false,
        reason: 'auto-transition-disabled',
      };
    }
    if (!this.deps.config.autoTransition.toStatus) {
      return {
        attempted: false,
        transitioned: false,
        reason: 'auto-transition-target-missing',
      };
    }
    if (!isSuccessConclusion(event.overallConclusion)) {
      return {
        attempted: false,
        transitioned: false,
        reason: 'ci-conclusion-not-success',
      };
    }

    const task = this.deps.taskRepo.getById(taskId);
    if (!task) {
      return {
        attempted: true,
        transitioned: false,
        reason: 'task-not-found',
      };
    }

    if (task.status === this.deps.config.autoTransition.toStatus) {
      return {
        attempted: true,
        transitioned: false,
        reason: 'already-at-target-status',
      };
    }

    const orchestrator = this.deps.orchestratorRepo.getByTaskId(taskId);
    if (!orchestrator) {
      return {
        attempted: true,
        transitioned: false,
        reason: 'orchestrator-state-not-found',
      };
    }

    const agentId = this.deps.config.autoTransition.agentId;
    let leaseAcquired = false;
    try {
      this.deps.leaseManager.acquire(taskId, agentId, 60_000);
      leaseAcquired = true;
      const result = transition(
        taskId,
        this.deps.config.autoTransition.toStatus,
        agentId,
        orchestrator.rev,
        this.deps.transitionDeps,
      );
      return {
        attempted: true,
        transitioned: true,
        toStatus: result.effectiveToStatus,
      };
    } catch (error: unknown) {
      const reason = String(error);
      this.deps.logger.warn(`ci-feedback auto-transition failed for task ${taskId}: ${reason}`);
      return {
        attempted: true,
        transitioned: false,
        reason,
      };
    } finally {
      if (leaseAcquired) {
        try {
          this.deps.leaseManager.release(taskId, agentId);
        } catch (error: unknown) {
          this.deps.logger.warn(
            `ci-feedback failed to release lease for task ${taskId}: ${String(error)}`,
          );
        }
      }
    }
  }

  async handleGithubWebhook(input: CiWebhookInput): Promise<CiWebhookResult> {
    if (!this.deps.config.enabled) {
      return {
        handled: false,
        cached: false,
        reason: 'ci-feedback-disabled',
      };
    }

    const normalized = normalizeGithubCiEvent(input.eventName, input.payload);
    if (!normalized) {
      return {
        handled: false,
        cached: false,
        reason: 'unsupported-event',
      };
    }

    if (normalized.action !== 'completed') {
      return {
        handled: false,
        cached: false,
        reason: 'event-not-completed',
      };
    }

    const taskId = this.resolveTaskIdFromBranch(normalized.branch);
    if (!taskId) {
      return {
        handled: false,
        cached: false,
        reason: 'task-not-resolved-from-branch',
      };
    }

    const idempotent = await withIdempotency<{
      commentPosted: boolean;
      transition: CiTransitionResult;
    }>({
      taskId,
      tool: 'vcs.ci.feedback',
      payload: {
        deliveryId: input.deliveryId,
        eventName: normalized.eventName,
        action: normalized.action,
        branch: normalized.branch,
        prNumber: normalized.prNumber,
        overallConclusion: normalized.overallConclusion,
        overallStatus: normalized.overallStatus,
        runUrl: normalized.runUrl,
        checks: normalized.checks.map((check) => ({
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
          detailsUrl: check.detailsUrl,
        })),
      },
      deps: {
        requestRepo: this.deps.requestRepo,
        generateId: this.deps.generateId,
        now: this.deps.now,
      },
      execute: async () => {
        this.updateTaskMetadataWithRetry(taskId, normalized, input.deliveryId);

        let commentPosted = false;
        if (this.deps.config.commentOnPr && normalized.prNumber !== null) {
          try {
            const comment = buildCiStatusComment(taskId, normalized);
            await this.deps.ghClient.commentPr(normalized.prNumber, comment);
            commentPosted = true;
          } catch (error: unknown) {
            this.deps.logger.warn(
              `ci-feedback PR comment failed for task ${taskId}: ${String(error)}`,
            );
          }
        }

        const transitionResult = this.tryAutoTransition(taskId, normalized);
        this.deps.eventLog.logVcsEvent(taskId, 'vcs.ci.feedback', null, {
          deliveryId: input.deliveryId,
          eventName: normalized.eventName,
          branch: normalized.branch,
          prNumber: normalized.prNumber,
          conclusion: normalized.overallConclusion,
          status: normalized.overallStatus,
          runUrl: normalized.runUrl,
          checkCount: normalized.checks.length,
          commentPosted,
          autoTransition: transitionResult,
        });

        this.deps.logger.info(
          `ci-feedback processed ${normalized.eventName} for task ${taskId} (pr=${normalized.prNumber ?? 'n/a'})`,
        );
        return {
          commentPosted,
          transition: transitionResult,
        };
      },
    });

    return {
      handled: true,
      cached: idempotent.cached,
      taskId,
      commentPosted: idempotent.result.commentPosted,
      transition: idempotent.result.transition,
    };
  }
}
