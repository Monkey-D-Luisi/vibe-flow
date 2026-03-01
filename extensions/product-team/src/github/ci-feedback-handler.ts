import {
  buildCiStatusComment,
  buildTaskIdCandidatesFromBranch,
  normalizeGithubCiEvent,
} from './ci-feedback-utils.js';
import { withIdempotency } from './idempotency.js';
import { updateTaskMetadataWithRetry } from './ci-feedback-metadata.js';
import { tryAutoTransition } from './ci-feedback-transition.js';
import type {
  CiFeedbackDeps,
  CiTransitionResult,
  CiWebhookInput,
  CiWebhookResult,
} from './ci-feedback-types.js';

function normalizeRepositoryName(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
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

    const expectedRepository = normalizeRepositoryName(this.deps.config.expectedRepository);
    const eventRepository = normalizeRepositoryName(normalized.repository);
    if (expectedRepository && eventRepository !== expectedRepository) {
      this.deps.logger.warn(
        `ci-feedback repository mismatch: expected '${expectedRepository}', got '${normalized.repository ?? 'unknown'}'`,
      );
      return {
        handled: false,
        cached: false,
        reason: 'repository-mismatch',
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
        updateTaskMetadataWithRetry(taskId, normalized, input.deliveryId, this.deps);

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

        const transitionResult = tryAutoTransition(taskId, normalized, this.deps);
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
