import { describe, it, expect } from 'vitest';
import { getToolLabel } from '../src/shared/tool-label-map.js';

describe('tool-label-map', () => {
  it('returns empty string for null tool', () => {
    expect(getToolLabel(null)).toBe('');
  });

  it('maps quality tools to readable labels', () => {
    expect(getToolLabel('quality_tests')).toBe('Running tests...');
    expect(getToolLabel('quality_lint')).toBe('Linting code...');
    expect(getToolLabel('quality_gate')).toBe('Evaluating gate...');
    expect(getToolLabel('qgate_tests')).toBe('Running quality check...');
  });

  it('maps task tools to readable labels', () => {
    expect(getToolLabel('task_create')).toBe('Creating task...');
    expect(getToolLabel('task_search')).toBe('Searching tasks...');
    expect(getToolLabel('task_get')).toBe('Reading task...');
    expect(getToolLabel('task_update')).toBe('Updating task...');
  });

  it('maps team communication to readable labels', () => {
    expect(getToolLabel('team_message')).toBe('Sending message...');
    expect(getToolLabel('team_reply')).toBe('Replying...');
    expect(getToolLabel('team_inbox')).toBe('Reading inbox...');
    expect(getToolLabel('team_assign')).toBe('Assigning work...');
  });

  it('maps VCS tools to readable labels', () => {
    expect(getToolLabel('vcs_pr_create')).toBe('Opening PR...');
    expect(getToolLabel('vcs_branch_create')).toBe('Creating branch...');
  });

  it('maps pipeline tools to readable labels', () => {
    expect(getToolLabel('pipeline_advance')).toBe('Advancing pipeline...');
    expect(getToolLabel('pipeline_start')).toBe('Starting pipeline...');
  });

  it('maps decision tools to readable labels', () => {
    expect(getToolLabel('decision_evaluate')).toBe('Evaluating decision...');
    expect(getToolLabel('decision_log')).toBe('Logging decision...');
  });

  it('returns a readable fallback for unknown tools', () => {
    expect(getToolLabel('some_unknown_tool')).toBe('Using some unknown tool...');
  });
});
