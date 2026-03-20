import { describe, it, expect } from 'vitest';
import { getToolAction } from '../src/shared/tool-action-map.js';

describe('tool-action-map', () => {
  it('returns idle for null tool', () => {
    expect(getToolAction(null)).toBe('idle');
  });

  it('maps quality tools to typing', () => {
    expect(getToolAction('quality_tests')).toBe('typing');
    expect(getToolAction('quality_lint')).toBe('typing');
    expect(getToolAction('quality_coverage')).toBe('typing');
    expect(getToolAction('quality_gate')).toBe('typing');
    expect(getToolAction('qgate_tests')).toBe('typing');
  });

  it('maps task search/get to reading', () => {
    expect(getToolAction('task_search')).toBe('reading');
    expect(getToolAction('task_get')).toBe('reading');
  });

  it('maps task create/update to typing', () => {
    expect(getToolAction('task_create')).toBe('typing');
    expect(getToolAction('task_update')).toBe('typing');
  });

  it('maps team communication to meeting', () => {
    expect(getToolAction('team_message')).toBe('meeting');
    expect(getToolAction('team_reply')).toBe('meeting');
    expect(getToolAction('team_assign')).toBe('meeting');
  });

  it('maps vcs tools to typing', () => {
    expect(getToolAction('vcs_branch_create')).toBe('typing');
    expect(getToolAction('vcs_pr_create')).toBe('typing');
  });

  it('maps pipeline_advance to walking', () => {
    expect(getToolAction('pipeline_advance')).toBe('walking');
  });

  it('returns typing for unknown tools', () => {
    expect(getToolAction('some_unknown_tool')).toBe('typing');
  });
});
