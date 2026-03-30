/**
 * Pipeline Advance Event Handler
 *
 * Handles `pipeline_advance` after_tool_call events by managing live
 * pipeline tracker messages (edit-in-place) with fallback to queued messages.
 *
 * Extracted from index.ts to keep modules under 500 LOC.
 * EP21 Task 0143 (code review refactor)
 */

import { formatPipelineAdvance, formatPipelineComplete } from '../formatting.js';
import {
  trackPipeline,
  getTrackedPipeline,
  updateTrackedStage,
  untrackPipeline,
  formatPipelineProgress,
} from '../pipeline-tracker.js';

interface PipelineHandlerDeps {
  readonly groupId: string;
  readonly enqueue: (text: string, priority: 'high' | 'normal' | 'low') => void;
  readonly slog: (level: 'info' | 'warn' | 'error', op: string, ctx?: Record<string, unknown>) => void;
  readonly getRuntime: () => {
    channel?: {
      telegram?: {
        sendMessageTelegram?: (
          chatId: string,
          text: string,
          opts?: Record<string, unknown>,
        ) => unknown;
        messageActions?: {
          handleAction?: (payload: Record<string, unknown>) => unknown;
        };
      };
    };
    config?: unknown;
  } | undefined;
  readonly apiConfig: unknown;
}

/**
 * Handle a pipeline_advance tool result.
 *
 * Manages live tracker messages (edit-in-place) for advancing pipelines
 * and falls back to enqueue when Telegram edit primitives are unavailable.
 */
export function handlePipelineAdvanceEvent(
  result: Record<string, unknown>,
  deps: PipelineHandlerDeps,
): void {
  const details = (result['details'] && typeof result['details'] === 'object')
    ? (result['details'] as Record<string, unknown>)
    : result;

  if (details['advanced'] !== true) return;

  const taskId = String(details['taskId'] ?? 'unknown');
  const previousStage = String(details['previousStage'] ?? '');
  const currentStage = String(details['currentStage'] ?? '');
  const title = String(details['title'] ?? '');

  const tracked = getTrackedPipeline(taskId);
  if (tracked) {
    handleExistingTracker(taskId, previousStage, currentStage, details, deps);
  } else {
    handleNewTracker(taskId, previousStage, currentStage, title, details, deps);
  }
}

/** Update an existing tracked pipeline message via edit-in-place. */
function handleExistingTracker(
  taskId: string,
  previousStage: string,
  currentStage: string,
  details: Record<string, unknown>,
  deps: PipelineHandlerDeps,
): void {
  if (!previousStage) {
    // Empty previousStage would corrupt completedStages (#12)
    deps.enqueue(
      currentStage === 'DONE' ? formatPipelineComplete(details) : formatPipelineAdvance(details),
      'normal',
    );
    return;
  }

  const updated = updateTrackedStage(taskId, previousStage, currentStage);
  if (!updated) return;

  const text = formatPipelineProgress(updated);
  const runtime = deps.getRuntime();
  const ma = runtime?.channel?.telegram?.messageActions;

  if (ma?.handleAction) {
    Promise.resolve(ma.handleAction({
      channel: 'telegram' as never,
      action: 'edit' as never,
      cfg: deps.apiConfig,
      params: {
        chatId: updated.chatId,
        messageId: Number(updated.messageId),
        message: text,
      },
    })).catch((err: unknown) => {
      deps.slog('warn', 'pipeline_tracker.edit_failed', { taskId, err: String(err) });
      // Fallback: send a new message
      deps.enqueue(
        currentStage === 'DONE' ? formatPipelineComplete(details) : formatPipelineAdvance(details),
        'normal',
      );
    });
  } else {
    // No edit capability — fallback to queued message (#8, #18)
    deps.enqueue(
      currentStage === 'DONE' ? formatPipelineComplete(details) : formatPipelineAdvance(details),
      'normal',
    );
  }
}

/** Create a new tracker message for a first-seen pipeline. */
function handleNewTracker(
  taskId: string,
  previousStage: string,
  currentStage: string,
  title: string,
  details: Record<string, unknown>,
  deps: PipelineHandlerDeps,
): void {
  const runtime = deps.getRuntime();
  const sendTg = runtime?.channel?.telegram?.sendMessageTelegram;

  if (typeof sendTg !== 'function') {
    deps.enqueue(
      currentStage === 'DONE' ? formatPipelineComplete(details) : formatPipelineAdvance(details),
      'normal',
    );
    return;
  }

  // Create a temporary tracked entry so formatPipelineProgress works
  trackPipeline(taskId, deps.groupId, '0', title, currentStage);
  const tempTracked = getTrackedPipeline(taskId);
  if (tempTracked && previousStage) {
    tempTracked.completedStages.add(previousStage);
  }
  const text = tempTracked
    ? formatPipelineProgress(tempTracked)
    : formatPipelineAdvance(details);

  Promise.resolve(sendTg(deps.groupId, text, { textMode: 'markdown' }))
    .then((sent: unknown) => {
      const sendResult = sent as { messageId?: string; chatId?: string } | undefined;
      const msgId = String(sendResult?.messageId ?? '0');

      if (msgId === '0') {
        // Send succeeded but no message ID — untrack to prevent edit failures (#7)
        untrackPipeline(taskId);
        return;
      }

      const chatId = String(sendResult?.chatId ?? deps.groupId);
      // Re-track with actual messageId from Telegram
      trackPipeline(taskId, chatId, msgId, title, currentStage);
      if (previousStage) {
        const t = getTrackedPipeline(taskId);
        if (t) t.completedStages.add(previousStage);
      }
    })
    .catch((err: unknown) => {
      deps.slog('warn', 'pipeline_tracker.send_failed', { taskId, err: String(err) });
      // Untrack on failure to prevent infinite edit retries (#7)
      untrackPipeline(taskId);
    });
}
