import { StaleRevisionError } from '../domain/errors.js';
import type { NormalizedGithubCiEvent } from './ci-feedback-utils.js';
import type { CiFeedbackDeps, RecordValue } from './ci-feedback-types.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function mergeCiMetadata(
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

export function updateTaskMetadataWithRetry(
  taskId: string,
  event: NormalizedGithubCiEvent,
  deliveryId: string | null,
  deps: Pick<CiFeedbackDeps, 'taskRepo' | 'now'>,
): void {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const task = deps.taskRepo.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found while processing CI feedback`);
    }

    const timestamp = deps.now();
    const nextMetadata = mergeCiMetadata(task.metadata, event, deliveryId, timestamp);
    try {
      deps.taskRepo.update(
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
