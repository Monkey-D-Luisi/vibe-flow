/**
 * Live Pipeline Progress Tracker -- Single-message live updates.
 *
 * Instead of flooding the Telegram chat with one message per stage advance,
 * this tracker maintains a single message per task that gets edited in-place
 * as stages complete. Shows a visual progress bar with stage markers.
 *
 * Task 0143 (EP21) -- depends on Task 0142 (inline buttons infrastructure)
 */

import { escapeMarkdownV2 } from './formatting.js';

const STAGE_ORDER = [
  'IDEA', 'ROADMAP', 'REFINEMENT', 'DECOMPOSITION',
  'DESIGN', 'IMPLEMENTATION', 'QA', 'REVIEW', 'SHIPPING', 'DONE',
] as const;

type StageName = typeof STAGE_ORDER[number];

const STAGE_ABBREVIATIONS: Record<string, string> = {
  IDEA: 'IDEA',
  ROADMAP: 'ROAD',
  REFINEMENT: 'REFN',
  DECOMPOSITION: 'DCMP',
  DESIGN: 'DESGN',
  IMPLEMENTATION: 'IMPL',
  QA: 'QA',
  REVIEW: 'REVW',
  SHIPPING: 'SHIP',
  DONE: 'DONE',
};

/** Tracking info for a single pipeline message. */
export interface TrackedPipeline {
  readonly chatId: string;
  readonly messageId: string;
  readonly taskId: string;
  title: string;
  currentStage: string;
  completedStages: Set<string>;
  startedAt: number;
  lastUpdatedAt: number;
}

/** In-memory map of tracked pipeline messages, keyed by taskId. */
const trackedPipelines = new Map<string, TrackedPipeline>();

/** Max tracked pipelines to prevent memory leaks. */
const MAX_TRACKED = 50;

/**
 * Track a new pipeline message for live updates.
 */
export function trackPipeline(
  taskId: string,
  chatId: string,
  messageId: string,
  title: string,
  currentStage: string,
): void {
  // Evict oldest if at capacity
  if (trackedPipelines.size >= MAX_TRACKED && !trackedPipelines.has(taskId)) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of trackedPipelines) {
      if (entry.lastUpdatedAt < oldestTime) {
        oldestTime = entry.lastUpdatedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) trackedPipelines.delete(oldestKey);
  }

  const completedStages = new Set<string>();
  const idx = STAGE_ORDER.indexOf(currentStage as StageName);
  if (idx > 0) {
    for (let i = 0; i < idx; i++) {
      completedStages.add(STAGE_ORDER[i]!);
    }
  }

  trackedPipelines.set(taskId, {
    chatId,
    messageId,
    taskId,
    title,
    currentStage,
    completedStages,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
  });
}

/**
 * Get an existing tracked pipeline. Returns undefined if not tracked.
 */
export function getTrackedPipeline(taskId: string): TrackedPipeline | undefined {
  return trackedPipelines.get(taskId);
}

/**
 * Update tracking state when a stage advances.
 * Returns the tracked pipeline if it exists and was updated, undefined otherwise.
 */
export function updateTrackedStage(
  taskId: string,
  previousStage: string,
  newStage: string,
): TrackedPipeline | undefined {
  const tracked = trackedPipelines.get(taskId);
  if (!tracked) return undefined;

  tracked.completedStages.add(previousStage);
  tracked.currentStage = newStage;
  tracked.lastUpdatedAt = Date.now();

  // Clean up completed pipelines after a delay
  if (newStage === 'DONE') {
    tracked.completedStages.add('DONE');
    setTimeout(() => trackedPipelines.delete(taskId), 300_000); // 5 min
  }

  return tracked;
}

/**
 * Remove tracking for a task.
 */
export function untrackPipeline(taskId: string): boolean {
  return trackedPipelines.delete(taskId);
}

/**
 * Get all currently tracked pipelines.
 */
export function listTrackedPipelines(): ReadonlyMap<string, TrackedPipeline> {
  return trackedPipelines;
}

/**
 * Clear all tracked pipelines.
 * Exposed for testing purposes.
 */
export function clearTrackedPipelines(): void {
  trackedPipelines.clear();
}

/** Stage icon for the progress display. */
function stageIcon(stage: string, currentStage: string, completed: Set<string>): string {
  if (completed.has(stage)) return '✅';
  if (stage === currentStage) return '🔄';
  return '⬜';
}

/**
 * Format the pipeline progress message for Telegram MarkdownV2.
 *
 * Visual format:
 * ```
 * 🚀 Pipeline: <taskId>
 * <title>
 *
 * ✅ IDEA → ✅ ROAD → 🔄 IMPL → ⬜ QA → ⬜ DONE
 *
 * ████████░░ 60% (6/10 stages)
 *
 * ⏱ Elapsed: 5m32s
 * ```
 */
export function formatPipelineProgress(tracked: TrackedPipeline): string {
  const lines: string[] = [];
  const displayId = tracked.taskId.length > 12
    ? tracked.taskId.slice(-12)
    : tracked.taskId;

  lines.push(`🚀 *Pipeline:* \`${escapeMarkdownV2(displayId)}\``);
  if (tracked.title) {
    lines.push(`_${escapeMarkdownV2(tracked.title.slice(0, 60))}_`);
  }
  lines.push('');

  // Stage progression line (abbreviated, with icons)
  const stageTokens: string[] = [];
  for (const stage of STAGE_ORDER) {
    const icon = stageIcon(stage, tracked.currentStage, tracked.completedStages);
    const abbr = STAGE_ABBREVIATIONS[stage] ?? stage;
    stageTokens.push(`${icon}${escapeMarkdownV2(abbr)}`);
  }
  // Split into two lines for readability
  const mid = Math.ceil(stageTokens.length / 2);
  lines.push(stageTokens.slice(0, mid).join(' → '));
  lines.push(stageTokens.slice(mid).join(' → '));

  lines.push('');

  // Progress bar
  const totalStages = STAGE_ORDER.length;
  const completedCount = tracked.completedStages.size;
  const pct = Math.round((completedCount / totalStages) * 100);
  const barWidth = 10;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
  lines.push(`\`${bar}\` ${pct}% \\(${completedCount}/${totalStages} stages\\)`);

  // Elapsed time
  const elapsed = Date.now() - tracked.startedAt;
  lines.push('');
  lines.push(`⏱ Elapsed: ${escapeMarkdownV2(formatDuration(elapsed))}`);

  // DONE celebration
  if (tracked.currentStage === 'DONE' && tracked.completedStages.has('DONE')) {
    lines.push('');
    lines.push('🏁 *Pipeline Complete\\!*');
  }

  return lines.join('\n');
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem > 0 ? `${min}m${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h${remMin}m` : `${hr}h`;
}
