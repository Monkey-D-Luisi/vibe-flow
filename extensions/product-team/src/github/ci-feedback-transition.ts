import { transition } from '../orchestrator/state-machine.js';
import type { NormalizedGithubCiEvent } from './ci-feedback-utils.js';
import type { CiFeedbackDeps, CiTransitionResult } from './ci-feedback-types.js';

function isSuccessConclusion(value: string | null): boolean {
  return value === 'success';
}

export function tryAutoTransition(
  taskId: string,
  event: NormalizedGithubCiEvent,
  deps: Pick<
    CiFeedbackDeps,
    'config' | 'taskRepo' | 'orchestratorRepo' | 'leaseManager' | 'transitionDeps' | 'logger'
  >,
): CiTransitionResult {
  if (!deps.config.autoTransition.enabled) {
    return {
      attempted: false,
      transitioned: false,
      reason: 'auto-transition-disabled',
    };
  }
  if (!deps.config.autoTransition.toStatus) {
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

  const task = deps.taskRepo.getById(taskId);
  if (!task) {
    return {
      attempted: true,
      transitioned: false,
      reason: 'task-not-found',
    };
  }

  if (task.status === deps.config.autoTransition.toStatus) {
    return {
      attempted: true,
      transitioned: false,
      reason: 'already-at-target-status',
    };
  }

  const orchestrator = deps.orchestratorRepo.getByTaskId(taskId);
  if (!orchestrator) {
    return {
      attempted: true,
      transitioned: false,
      reason: 'orchestrator-state-not-found',
    };
  }

  const agentId = deps.config.autoTransition.agentId;
  let leaseAcquired = false;
  try {
    deps.leaseManager.acquire(taskId, agentId, 60_000);
    leaseAcquired = true;
    const result = transition(
      taskId,
      deps.config.autoTransition.toStatus,
      agentId,
      orchestrator.rev,
      deps.transitionDeps,
    );
    return {
      attempted: true,
      transitioned: true,
      toStatus: result.effectiveToStatus,
    };
  } catch (error: unknown) {
    const reason = String(error);
    deps.logger.warn(`ci-feedback auto-transition failed for task ${taskId}: ${reason}`);
    return {
      attempted: true,
      transitioned: false,
      reason,
    };
  } finally {
    if (leaseAcquired) {
      try {
        deps.leaseManager.release(taskId, agentId);
      } catch (error: unknown) {
        deps.logger.warn(
          `ci-feedback failed to release lease for task ${taskId}: ${String(error)}`,
        );
      }
    }
  }
}
