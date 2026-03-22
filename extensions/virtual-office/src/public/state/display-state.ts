import type { ServerAgentState } from '../net/sse-client.js';
import { PIPELINE_STAGES, STAGE_OWNERS, type PipelineStage } from '../../shared/stage-location-map.js';
import { getToolLabel } from '../../shared/tool-label-map.js';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface FreshnessDisplay {
  readonly tone: 'live' | 'recent' | 'stale' | 'offline' | 'connecting';
  readonly badge: string;
  readonly detail: string;
  readonly ageMs: number;
}

export interface AgentDisplayState {
  readonly agentId: string;
  readonly roleLabel: string;
  readonly statusLabel: string;
  readonly statusTone: 'busy' | 'idle' | 'offline';
  readonly activityLabel: string;
  readonly pipelineLabel: string;
  readonly taskLabel: string;
  readonly taskShort: string | null;
  readonly taskFull: string | null;
  readonly stageLabel: string | null;
  readonly freshness: FreshnessDisplay;
  readonly pipelineContextMode: 'current' | 'last-known' | 'none';
}

export interface PipelineSummaryDisplay {
  readonly taskShort: string;
  readonly taskFull: string;
  readonly stageLabel: string;
  readonly stageShort: string;
  readonly currentIdx: number;
  readonly ownerLabel: string;
  readonly relatedLabels: string[];
  readonly activeNowCount: number;
  readonly participantCount: number;
  readonly freshness: FreshnessDisplay;
}

const LIVE_MS = 15_000;
const RECENT_MS = 60_000;
export const PIPELINE_GRACE_MS = 30 * 60 * 1000;
export const PIPELINE_STALE_MS = 2 * 60 * 60 * 1000;

export const ROLE_LABELS: Record<string, string> = {
  pm: 'Project Manager',
  'tech-lead': 'Tech Lead',
  po: 'Product Owner',
  designer: 'Designer',
  'back-1': 'Backend Dev',
  'front-1': 'Frontend Dev',
  qa: 'QA Engineer',
  devops: 'DevOps Engineer',
};

const STAGE_LABELS: Record<string, string> = {
  IDEA: 'Idea',
  ROADMAP: 'Roadmap',
  REFINEMENT: 'Refinement',
  DECOMPOSITION: 'Decomposition',
  DESIGN: 'Design',
  IMPLEMENTATION: 'Implementation',
  QA: 'QA',
  REVIEW: 'Review',
  SHIPPING: 'Shipping',
  DONE: 'Done',
};

const STAGE_SHORT_LABELS: Record<string, string> = {
  IDEA: 'Idea',
  ROADMAP: 'Road',
  REFINEMENT: 'Refn',
  DECOMPOSITION: 'Decomp',
  DESIGN: 'Design',
  IMPLEMENTATION: 'Build',
  QA: 'QA',
  REVIEW: 'Review',
  SHIPPING: 'Ship',
  DONE: 'Done',
};

export function formatStageLabel(stage: string | null): string | null {
  if (!stage) return null;
  return STAGE_LABELS[stage] ?? stage.charAt(0) + stage.slice(1).toLowerCase();
}

export function formatStageShort(stage: string | null): string {
  if (!stage) return '--';
  return STAGE_SHORT_LABELS[stage] ?? stage.slice(0, 4);
}

export function formatTaskReference(taskId: string | null): { short: string; full: string } | null {
  if (!taskId) return null;
  return {
    short: `#${taskId.slice(-6)}`,
    full: taskId,
  };
}

export function deriveFreshness(
  lastSeenAt: number,
  connectionState: ConnectionState,
  now: number,
): FreshnessDisplay {
  const ageMs = Math.max(0, now - lastSeenAt);

  if (connectionState === 'connecting') {
    return {
      tone: 'connecting',
      badge: 'Connecting',
      detail: 'Waiting for live updates',
      ageMs,
    };
  }

  if (connectionState === 'disconnected') {
    return {
      tone: 'offline',
      badge: 'Last known',
      detail: lastSeenAt > 0
        ? `Connection lost · updated ${formatRelativeAge(ageMs)}`
        : 'Connection lost · no live data',
      ageMs,
    };
  }

  if (ageMs < LIVE_MS) {
    return {
      tone: 'live',
      badge: 'Live',
      detail: ageMs < 2_000 ? 'Updated just now' : `Updated ${formatRelativeAge(ageMs)}`,
      ageMs,
    };
  }

  if (ageMs < RECENT_MS) {
    return {
      tone: 'recent',
      badge: 'Recent',
      detail: `Updated ${formatRelativeAge(ageMs)}`,
      ageMs,
    };
  }

  return {
    tone: 'stale',
    badge: 'Stale',
    detail: `Updated ${formatRelativeAge(ageMs)}`,
    ageMs,
  };
}

export function deriveAgentDisplayState(
  state: ServerAgentState,
  now: number,
  connectionState: ConnectionState,
): AgentDisplayState {
  const freshness = deriveFreshness(state.lastSeenAt, connectionState, now);
  const stageLabel = formatStageLabel(state.pipelineStage);
  const taskRef = formatTaskReference(state.taskId);

  let statusLabel = 'Idle';
  let statusTone: AgentDisplayState['statusTone'] = 'idle';
  switch (state.status) {
    case 'active':
      statusLabel = 'Working';
      statusTone = 'busy';
      break;
    case 'spawning':
      statusLabel = 'Starting';
      statusTone = 'busy';
      break;
    case 'offline':
      statusLabel = 'Offline';
      statusTone = 'offline';
      break;
    case 'idle':
      statusLabel = stageLabel || taskRef ? 'Idle now' : 'Idle';
      statusTone = 'idle';
      break;
  }

  let activityLabel = 'No current activity';
  if (state.currentTool) {
    activityLabel = getToolLabel(state.currentTool);
  } else if (state.status === 'active') {
    activityLabel = stageLabel ? 'Between pipeline steps' : 'Between tool steps';
  } else if (state.status === 'spawning') {
    activityLabel = 'Preparing agent session';
  } else if (connectionState === 'disconnected') {
    activityLabel = 'Showing last known state';
  }

  let pipelineLabel = 'No pipeline context';
  let pipelineContextMode: AgentDisplayState['pipelineContextMode'] = 'none';
  if (stageLabel && taskRef) {
    pipelineContextMode = state.status === 'active' ? 'current' : 'last-known';
    pipelineLabel = `${pipelineContextMode === 'current' ? 'Current' : 'Last known'} stage: ${stageLabel} · ${taskRef.short}`;
  } else if (stageLabel) {
    pipelineContextMode = state.status === 'active' ? 'current' : 'last-known';
    pipelineLabel = `${pipelineContextMode === 'current' ? 'Current' : 'Last known'} stage: ${stageLabel}`;
  } else if (taskRef) {
    pipelineContextMode = state.status === 'active' ? 'current' : 'last-known';
    pipelineLabel = `${pipelineContextMode === 'current' ? 'Current' : 'Last known'} task: ${taskRef.short}`;
  }

  return {
    agentId: state.agentId,
    roleLabel: ROLE_LABELS[state.agentId] ?? state.agentId,
    statusLabel,
    statusTone,
    activityLabel,
    pipelineLabel,
    taskLabel: taskRef ? taskRef.short : 'No task linked',
    taskShort: taskRef?.short ?? null,
    taskFull: taskRef?.full ?? null,
    stageLabel,
    freshness,
    pipelineContextMode,
  };
}

export function derivePipelineSummary(
  states: readonly ServerAgentState[],
  now: number,
  connectionState: ConnectionState,
): PipelineSummaryDisplay | null {
  const pipelineFilter = (state: ServerAgentState, maxAge: number) =>
    state.taskId &&
    state.pipelineStage &&
    state.pipelineStage !== 'DONE' &&
    now - state.lastSeenAt < maxAge;

  let candidates = states.filter(state => pipelineFilter(state, PIPELINE_GRACE_MS));

  // Fallback: include stale candidates if no recent ones
  if (candidates.length === 0) {
    candidates = states.filter(state => pipelineFilter(state, PIPELINE_STALE_MS));
  }

  if (candidates.length === 0) {
    return null;
  }

  const byTask = new Map<string, ServerAgentState[]>();
  for (const state of candidates) {
    const key = state.taskId!;
    const bucket = byTask.get(key) ?? [];
    bucket.push(state);
    byTask.set(key, bucket);
  }

  const [taskId, group] = [...byTask.entries()]
    .sort(([, left], [, right]) => maxLastSeen(right) - maxLastSeen(left))[0]!;
  group.sort((left, right) => right.lastSeenAt - left.lastSeenAt);

  const primaryState = group.find(state => state.status === 'active') ?? group[0]!;
  const stage = primaryState.pipelineStage!;
  const taskRef = formatTaskReference(taskId)!;
  const freshness = deriveFreshness(maxLastSeen(group), connectionState, now);
  const ownerId = STAGE_OWNERS[stage as PipelineStage] ?? null;
  const relatedLabels = group
    .filter(state => state.agentId !== ownerId)
    .map(state => ROLE_LABELS[state.agentId] ?? state.agentId);

  return {
    taskShort: taskRef.short,
    taskFull: taskRef.full,
    stageLabel: formatStageLabel(stage) ?? stage,
    stageShort: formatStageShort(stage),
    currentIdx: PIPELINE_STAGES.indexOf(stage as PipelineStage),
    ownerLabel: ownerId ? (ROLE_LABELS[ownerId] ?? ownerId) : 'Unassigned',
    relatedLabels,
    activeNowCount: group.filter(state => state.status === 'active').length,
    participantCount: group.length,
    freshness,
  };
}

function maxLastSeen(states: readonly ServerAgentState[]): number {
  return states.reduce((latest, state) => Math.max(latest, state.lastSeenAt), 0);
}

function formatRelativeAge(ageMs: number): string {
  if (ageMs < 5_000) return 'just now';
  if (ageMs < 60_000) return `${Math.round(ageMs / 1_000)}s ago`;
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}