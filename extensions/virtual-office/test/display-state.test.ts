import { describe, expect, it } from 'vitest';
import {
  deriveAgentDisplayState,
  deriveFreshness,
  derivePipelineSummary,
  PIPELINE_GRACE_MS,
  PIPELINE_STALE_MS,
} from '../src/public/state/display-state.js';
import type { ServerAgentState } from '../src/public/net/sse-client.js';

function makeState(overrides: Partial<ServerAgentState> = {}): ServerAgentState {
  return {
    agentId: 'pm',
    status: 'idle',
    currentTool: null,
    pipelineStage: null,
    taskId: null,
    lastSeenAt: 100_000,
    toolCallSeq: 1,
    ...overrides,
  };
}

describe('display-state', () => {
  it('marks active agents without a current tool as between tool steps', () => {
    const display = deriveAgentDisplayState(
      makeState({ status: 'active' }),
      105_000,
      'connected',
    );

    expect(display.statusLabel).toBe('Working');
    expect(display.activityLabel).toBe('Between tool steps');
    expect(display.pipelineContextMode).toBe('none');
  });

  it('marks idle agents with pipeline context as last known', () => {
    const display = deriveAgentDisplayState(
      makeState({ pipelineStage: 'DESIGN', taskId: 'TASK-123456' }),
      120_000,
      'connected',
    );

    expect(display.statusLabel).toBe('Idle now');
    expect(display.pipelineContextMode).toBe('last-known');
    expect(display.pipelineLabel).toContain('Last known stage: Design');
    expect(display.taskLabel).toBe('#123456');
  });

  it('reports disconnected state as last known freshness', () => {
    const freshness = deriveFreshness(100_000, 'disconnected', 130_000);
    expect(freshness.badge).toBe('Last known');
    expect(freshness.detail).toContain('Connection lost');
  });

  it('builds a mixed pipeline summary for the freshest task group', () => {
    const summary = derivePipelineSummary([
      makeState({ agentId: 'designer', status: 'active', pipelineStage: 'DESIGN', taskId: 'TASK-AAA111', lastSeenAt: 200_000 }),
      makeState({ agentId: 'tech-lead', status: 'idle', pipelineStage: 'DESIGN', taskId: 'TASK-AAA111', lastSeenAt: 199_000 }),
      makeState({ agentId: 'po', status: 'active', pipelineStage: 'REFINEMENT', taskId: 'TASK-BBB222', lastSeenAt: 150_000 }),
    ], 205_000, 'connected');

    expect(summary).not.toBeNull();
    expect(summary?.taskShort).toBe('#AAA111');
    expect(summary?.stageLabel).toBe('Design');
    expect(summary?.ownerLabel).toBe('Designer');
    expect(summary?.relatedLabels).toContain('Tech Lead');
  });

  it('pipeline within 30-min grace period is returned', () => {
    const now = 200_000;
    const summary = derivePipelineSummary([
      makeState({ agentId: 'back-1', status: 'active', pipelineStage: 'IMPLEMENTATION', taskId: 'TASK-GRACE', lastSeenAt: now - (PIPELINE_GRACE_MS - 60_000) }),
    ], now, 'connected');

    expect(summary).not.toBeNull();
    expect(summary?.stageLabel).toBe('Implementation');
  });

  it('pipeline beyond grace but within stale period is returned via fallback', () => {
    const now = 200_000;
    const staleAge = PIPELINE_GRACE_MS + 15 * 60 * 1000; // 45 min ago
    const summary = derivePipelineSummary([
      makeState({ agentId: 'qa', status: 'idle', pipelineStage: 'QA', taskId: 'TASK-STALE', lastSeenAt: now - staleAge }),
    ], now, 'connected');

    expect(summary).not.toBeNull();
    expect(summary?.taskShort).toBe('#-STALE');
  });

  it('pipeline beyond stale period returns null', () => {
    const now = 200_000;
    const expiredAge = PIPELINE_STALE_MS + 60_000; // beyond 2h
    const summary = derivePipelineSummary([
      makeState({ agentId: 'qa', status: 'idle', pipelineStage: 'QA', taskId: 'TASK-OLD', lastSeenAt: now - expiredAge }),
    ], now, 'connected');

    expect(summary).toBeNull();
  });

  it('active candidates take priority over stale candidates', () => {
    const now = 200_000;
    const summary = derivePipelineSummary([
      // Active group (recent)
      makeState({ agentId: 'back-1', status: 'active', pipelineStage: 'IMPLEMENTATION', taskId: 'TASK-ACTIVE', lastSeenAt: now - 5_000 }),
      // Stale group (old but within stale window)
      makeState({ agentId: 'qa', status: 'idle', pipelineStage: 'QA', taskId: 'TASK-STALE2', lastSeenAt: now - PIPELINE_GRACE_MS - 60_000 }),
    ], now, 'connected');

    expect(summary).not.toBeNull();
    // Active group should be returned (TASK-ACTIVE), not stale
    expect(summary?.taskFull).toBe('TASK-ACTIVE');
  });
});