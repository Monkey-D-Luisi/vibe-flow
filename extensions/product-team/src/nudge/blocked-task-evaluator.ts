/**
 * Blocked Task Evaluator
 *
 * Scans pipeline tasks for stages that have been in-progress longer than
 * staleThresholdMs and proposes an action: retry, escalate, or skip.
 */

import type { SqliteTaskRepository } from '../persistence/task-repository.js';
import type { BlockedTaskEntry } from '../schemas/nudge.schema.js';

export const DEFAULT_STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_RETRIES = 3;

/** Keys in task.metadata that store stage start timestamps. */
function stageStartKey(stage: string): string {
  return `${stage}_startedAt`;
}

export interface EvaluatorOptions {
  staleThresholdMs?: number;
  maxRetries?: number;
  nowMs?: number;
}

export function evaluateBlockedTasks(
  taskRepo: SqliteTaskRepository,
  options: EvaluatorOptions = {},
): BlockedTaskEntry[] {
  const staleThreshold = options.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const nowMs = options.nowMs ?? Date.now();

  // Fetch all tasks tagged as pipeline tasks still in progress
  const tasks = taskRepo.search({ tags: ['pipeline'], limit: 200 });

  const blocked: BlockedTaskEntry[] = [];

  for (const task of tasks) {
    const meta = task.metadata as Record<string, unknown>;
    const stage = meta['pipelineStage'] as string | undefined;
    if (!stage || stage === 'DONE') continue;

    const startedAtKey = stageStartKey(stage);
    const startedAt = meta[startedAtKey] as string | undefined;
    if (!startedAt) continue;

    const startedAtMs = new Date(startedAt).getTime();
    if (isNaN(startedAtMs)) continue;

    const staleDurationMs = nowMs - startedAtMs;
    if (staleDurationMs < staleThreshold) continue;

    // Determine proposed action based on retry count
    const retryKey = `${stage}_retryCount`;
    const retryCount = (meta[retryKey] as number | undefined) ?? 0;

    // Three-tier escalation: retry (0..maxRetries-1) → escalate (maxRetries..maxRetries*2-1) → skip (≥maxRetries*2)
    let proposedAction: BlockedTaskEntry['proposedAction'];
    if (retryCount < maxRetries) {
      proposedAction = 'retry';
    } else if (retryCount >= maxRetries * 2) {
      proposedAction = 'skip';
    } else {
      proposedAction = 'escalate';
    }

    blocked.push({
      taskId: task.id,
      stage,
      staleDurationMs,
      proposedAction,
    });
  }

  return blocked;
}
