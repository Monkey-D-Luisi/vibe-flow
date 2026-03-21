import { describe, it, expect, vi } from 'vitest';
import { renderPipelineView, handlePipeline } from '../../src/commands/pipeline-view.js';
import type { PipelineDataSource } from '../../src/commands/pipeline-view.js';
import type { ApiTimelineResponse } from '../../src/api-client.js';

function makeTimeline(overrides?: Partial<ApiTimelineResponse>): ApiTimelineResponse {
  return {
    timestamp: '2026-03-21T20:00:00Z',
    activeTasks: 1,
    timelines: [{
      taskId: 'TASK-0079',
      title: 'Complexity scorer',
      currentStage: 'IMPLEMENTATION',
      stages: [
        { stage: 'IDEA', enteredAt: '2026-03-21T19:00:00Z', completedAt: '2026-03-21T19:03:00Z', durationMs: 180000, agentId: 'pm' },
        { stage: 'ROADMAP', enteredAt: '2026-03-21T19:03:00Z', completedAt: '2026-03-21T19:08:00Z', durationMs: 300000, agentId: 'pm' },
        { stage: 'IMPLEMENTATION', enteredAt: '2026-03-21T19:30:00Z', completedAt: null, durationMs: null, agentId: 'back-1' },
      ],
      totalDurationMs: null,
    }],
    ...overrides,
  };
}

function makeSingleTimeline(): ApiTimelineResponse {
  return {
    timestamp: '2026-03-21T20:00:00Z',
    taskId: 'TASK-0079',
    title: 'Complexity scorer',
    currentStage: 'IMPLEMENTATION',
    stages: [
      { stage: 'IDEA', enteredAt: '2026-03-21T19:00:00Z', completedAt: '2026-03-21T19:03:00Z', durationMs: 180000, agentId: 'pm' },
      { stage: 'IMPLEMENTATION', enteredAt: '2026-03-21T19:30:00Z', completedAt: null, durationMs: null, agentId: 'back-1' },
    ],
    totalDurationMs: null,
  };
}

describe('pipeline-view', () => {
  describe('renderPipelineView', () => {
    it('renders multi-task pipeline list', () => {
      const result = renderPipelineView(makeTimeline());
      expect(result).toContain('Pipeline: TASK-0079');
      expect(result).toContain('IDEA');
      expect(result).toContain('IMPLEMENTATION');
    });

    it('renders single-task pipeline', () => {
      const result = renderPipelineView(makeSingleTimeline());
      expect(result).toContain('Pipeline: TASK-0079');
      expect(result).toContain('Complexity scorer');
    });

    it('shows completed stages with OK', () => {
      const result = renderPipelineView(makeTimeline());
      expect(result).toContain('OK  IDEA');
    });

    it('shows active stage with >>', () => {
      const result = renderPipelineView(makeTimeline());
      expect(result).toContain('>>  IMPLEMENTATION');
    });

    it('shows no active pipelines message', () => {
      const timeline: ApiTimelineResponse = {
        timestamp: '2026-03-21T20:00:00Z',
        activeTasks: 0,
        timelines: [],
      };
      const result = renderPipelineView(timeline);
      expect(result).toContain('No active pipelines');
    });

    it('formats duration correctly', () => {
      const result = renderPipelineView(makeTimeline());
      expect(result).toContain('3m'); // 180000ms = 3m
      expect(result).toContain('5m'); // 300000ms = 5m
    });
  });

  describe('handlePipeline', () => {
    it('fetches timeline without args', async () => {
      const ds: PipelineDataSource = {
        getTimeline: vi.fn().mockResolvedValue(makeTimeline()),
      };
      const result = await handlePipeline(ds);
      expect(result).toContain('Pipeline');
      expect(ds.getTimeline).toHaveBeenCalledWith(undefined);
    });

    it('fetches specific task timeline with args', async () => {
      const ds: PipelineDataSource = {
        getTimeline: vi.fn().mockResolvedValue(makeSingleTimeline()),
      };
      const result = await handlePipeline(ds, 'TASK-0079');
      expect(ds.getTimeline).toHaveBeenCalledWith('TASK-0079');
      expect(result).toContain('TASK-0079');
    });

    it('returns error message on failure', async () => {
      const ds: PipelineDataSource = {
        getTimeline: vi.fn().mockRejectedValue(new Error('not found')),
      };
      const result = await handlePipeline(ds);
      expect(result).toContain('Pipeline view unavailable');
    });
  });
});
