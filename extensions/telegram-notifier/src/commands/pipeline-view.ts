/**
 * /pipeline Command -- Active pipeline visualization for Telegram.
 *
 * Shows the current pipeline execution status with stage progression,
 * elapsed time, and cost per stage.
 *
 * Task 0106 (EP15)
 */

import { escapeMarkdownV2 } from '../formatting.js';
import type { ApiTimelineResponse, ApiStageEntry } from '../api-client.js';

/** Data source abstraction for testability. */
export interface PipelineDataSource {
  getTimeline(taskId?: string): Promise<ApiTimelineResponse>;
}

const STAGE_ORDER = [
  'IDEA', 'ROADMAP', 'REFINEMENT', 'DECOMPOSITION',
  'DESIGN', 'IMPLEMENTATION', 'QA', 'REVIEW', 'SHIPPING', 'DONE',
];

function stageIcon(stage: ApiStageEntry, currentStage: string): string {
  if (stage.completedAt) return 'OK ';
  if (stage.stage === currentStage && stage.enteredAt) return '>> ';
  if (stage.enteredAt && !stage.completedAt && stage.stage !== currentStage) return 'SKP';
  return '   ';
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m${rem}s` : `${min}m`;
}

function renderSinglePipeline(
  taskId: string,
  title: string,
  currentStage: string,
  stages: readonly ApiStageEntry[],
  totalDurationMs: number | null,
): string {
  const stageMap = new Map(stages.map(s => [s.stage, s]));
  const displayId = taskId.length > 12 ? taskId.slice(-12) : taskId;

  const lines: string[] = [];
  lines.push('```');
  lines.push(`Pipeline: ${displayId}`);
  if (title) lines.push(`  ${title.slice(0, 50)}`);
  lines.push('─'.repeat(50));

  for (const stageName of STAGE_ORDER) {
    const entry = stageMap.get(stageName);
    const icon = entry ? stageIcon(entry, currentStage) : '   ';
    const agent = entry?.agentId ?? '--';
    const dur = entry ? formatDuration(entry.durationMs) : '--';
    lines.push(`${icon} ${stageName.padEnd(15)}${agent.padEnd(12)}${dur}`);
  }

  lines.push('─'.repeat(50));
  lines.push(`Elapsed: ${formatDuration(totalDurationMs)}`);
  lines.push('```');
  return lines.join('\n');
}

export function renderPipelineView(timeline: ApiTimelineResponse): string {
  // Single task response
  if (timeline.taskId && timeline.stages) {
    return renderSinglePipeline(
      timeline.taskId,
      timeline.title ?? '',
      timeline.currentStage ?? '',
      timeline.stages,
      timeline.totalDurationMs ?? null,
    );
  }

  // Multi-task response
  const timelines = timeline.timelines ?? [];
  if (timelines.length === 0) {
    return '```\nNo active pipelines.\n```';
  }

  const sections = timelines.map(t =>
    renderSinglePipeline(t.taskId, t.title, t.currentStage, t.stages, t.totalDurationMs),
  );
  return sections.join('\n\n');
}

export async function handlePipeline(
  ds: PipelineDataSource,
  args?: string,
): Promise<string> {
  try {
    const taskId = args?.trim() || undefined;
    const timeline = await ds.getTimeline(taskId);
    return renderPipelineView(timeline);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return escapeMarkdownV2(`Pipeline view unavailable: ${msg}`);
  }
}
