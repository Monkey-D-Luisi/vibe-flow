/**
 * Tests for pipeline-tracker module.
 *
 * Task 0143 (EP21)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  trackPipeline,
  getTrackedPipeline,
  updateTrackedStage,
  untrackPipeline,
  formatPipelineProgress,
  clearTrackedPipelines,
  listTrackedPipelines,
} from '../src/pipeline-tracker.js';

beforeEach(() => {
  clearTrackedPipelines();
});

describe('trackPipeline', () => {
  it('tracks a new pipeline', () => {
    trackPipeline('T-001', '-100', '42', 'My Task', 'IDEA');
    const tracked = getTrackedPipeline('T-001');
    expect(tracked).toBeDefined();
    expect(tracked!.taskId).toBe('T-001');
    expect(tracked!.chatId).toBe('-100');
    expect(tracked!.messageId).toBe('42');
    expect(tracked!.title).toBe('My Task');
    expect(tracked!.currentStage).toBe('IDEA');
    expect(tracked!.completedStages.size).toBe(0);
  });

  it('marks earlier stages as completed when starting at a later stage', () => {
    trackPipeline('T-002', '-100', '43', 'Task 2', 'IMPLEMENTATION');
    const tracked = getTrackedPipeline('T-002')!;
    // IDEA, ROADMAP, REFINEMENT, DECOMPOSITION, DESIGN should be completed
    expect(tracked.completedStages.has('IDEA')).toBe(true);
    expect(tracked.completedStages.has('ROADMAP')).toBe(true);
    expect(tracked.completedStages.has('REFINEMENT')).toBe(true);
    expect(tracked.completedStages.has('DECOMPOSITION')).toBe(true);
    expect(tracked.completedStages.has('DESIGN')).toBe(true);
    expect(tracked.completedStages.has('IMPLEMENTATION')).toBe(false);
  });

  it('overwrites an existing tracked pipeline for the same taskId', () => {
    trackPipeline('T-003', '-100', '1', 'Original', 'IDEA');
    trackPipeline('T-003', '-200', '2', 'Updated', 'DESIGN');
    const tracked = getTrackedPipeline('T-003')!;
    expect(tracked.chatId).toBe('-200');
    expect(tracked.messageId).toBe('2');
    expect(tracked.title).toBe('Updated');
  });

  it('evicts oldest entry when at MAX_TRACKED capacity', () => {
    // Fill with 50 entries
    for (let i = 0; i < 50; i++) {
      trackPipeline(`task-${i}`, '-100', String(i), `Task ${i}`, 'IDEA');
    }
    expect(listTrackedPipelines().size).toBe(50);

    // Add one more, should evict task-0 (oldest)
    trackPipeline('task-new', '-100', '999', 'New Task', 'IDEA');
    expect(listTrackedPipelines().size).toBe(50);
    expect(getTrackedPipeline('task-0')).toBeUndefined();
    expect(getTrackedPipeline('task-new')).toBeDefined();
  });
});

describe('updateTrackedStage', () => {
  it('updates the current stage and marks previous as completed', () => {
    trackPipeline('T-010', '-100', '10', 'Task', 'IDEA');
    const updated = updateTrackedStage('T-010', 'IDEA', 'ROADMAP');
    expect(updated).toBeDefined();
    expect(updated!.currentStage).toBe('ROADMAP');
    expect(updated!.completedStages.has('IDEA')).toBe(true);
  });

  it('returns undefined for untracked tasks', () => {
    const result = updateTrackedStage('unknown', 'IDEA', 'ROADMAP');
    expect(result).toBeUndefined();
  });

  it('tracks sequential stage progression correctly', () => {
    trackPipeline('T-011', '-100', '11', 'Task', 'IDEA');
    updateTrackedStage('T-011', 'IDEA', 'ROADMAP');
    updateTrackedStage('T-011', 'ROADMAP', 'REFINEMENT');
    updateTrackedStage('T-011', 'REFINEMENT', 'DECOMPOSITION');

    const tracked = getTrackedPipeline('T-011')!;
    expect(tracked.currentStage).toBe('DECOMPOSITION');
    expect(tracked.completedStages.has('IDEA')).toBe(true);
    expect(tracked.completedStages.has('ROADMAP')).toBe(true);
    expect(tracked.completedStages.has('REFINEMENT')).toBe(true);
    expect(tracked.completedStages.has('DECOMPOSITION')).toBe(false);
  });

  it('marks DONE stage and schedules cleanup', () => {
    trackPipeline('T-012', '-100', '12', 'Task', 'SHIPPING');
    const updated = updateTrackedStage('T-012', 'SHIPPING', 'DONE');
    expect(updated).toBeDefined();
    expect(updated!.completedStages.has('DONE')).toBe(true);
    expect(updated!.completedStages.has('SHIPPING')).toBe(true);
    // Pipeline should still be tracked immediately (cleanup is delayed)
    expect(getTrackedPipeline('T-012')).toBeDefined();
  });
});

describe('untrackPipeline', () => {
  it('removes a tracked pipeline', () => {
    trackPipeline('T-020', '-100', '20', 'Task', 'IDEA');
    expect(untrackPipeline('T-020')).toBe(true);
    expect(getTrackedPipeline('T-020')).toBeUndefined();
  });

  it('returns false for non-existent pipeline', () => {
    expect(untrackPipeline('nonexistent')).toBe(false);
  });
});

describe('formatPipelineProgress', () => {
  it('formats a pipeline at IDEA stage', () => {
    trackPipeline('T-030', '-100', '30', 'My Feature', 'IDEA');
    const tracked = getTrackedPipeline('T-030')!;
    const text = formatPipelineProgress(tracked);

    expect(text).toContain('Pipeline:');
    expect(text).toContain('T\\-030');
    expect(text).toContain('My Feature');
    expect(text).toContain('🔄'); // current stage indicator
    expect(text).toContain('⬜'); // future stages
    expect(text).toContain('0%');
    expect(text).toContain('Elapsed:');
  });

  it('shows progress for mid-pipeline task', () => {
    trackPipeline('T-031', '-100', '31', 'Mid Task', 'IMPLEMENTATION');
    const tracked = getTrackedPipeline('T-031')!;
    const text = formatPipelineProgress(tracked);

    // 5 stages completed (IDEA through DESIGN), 10 total = 50%
    expect(text).toContain('50%');
    expect(text).toContain('5/10 stages');
    expect(text).toContain('✅'); // completed stages
    expect(text).toContain('🔄'); // current stage
    expect(text).toContain('⬜'); // future stages
  });

  it('shows completion celebration for DONE stage', () => {
    trackPipeline('T-032', '-100', '32', 'Complete Task', 'SHIPPING');
    updateTrackedStage('T-032', 'SHIPPING', 'DONE');
    const tracked = getTrackedPipeline('T-032')!;
    const text = formatPipelineProgress(tracked);

    expect(text).toContain('100%');
    expect(text).toContain('10/10 stages');
    expect(text).toContain('Pipeline Complete');
  });

  it('truncates long task IDs', () => {
    const longId = 'very-long-task-identifier-001';
    trackPipeline(longId, '-100', '33', 'Task', 'IDEA');
    const tracked = getTrackedPipeline(longId)!;
    const text = formatPipelineProgress(tracked);

    // Should show last 12 chars
    expect(text).toContain('ntifier\\-001');
  });

  it('truncates long titles', () => {
    const longTitle = 'A'.repeat(80);
    trackPipeline('T-034', '-100', '34', longTitle, 'IDEA');
    const tracked = getTrackedPipeline('T-034')!;
    const text = formatPipelineProgress(tracked);

    // Title should be truncated to 60 chars
    expect(text).toContain('A'.repeat(60));
  });

  it('escapes MarkdownV2 special characters in title', () => {
    trackPipeline('T-035', '-100', '35', 'feat: add user-auth (v2)', 'IDEA');
    const tracked = getTrackedPipeline('T-035')!;
    const text = formatPipelineProgress(tracked);

    // Special chars should be escaped
    expect(text).toContain('feat: add user\\-auth \\(v2\\)');
  });
});
