import { describe, it, expect } from 'vitest';
import { nextAgent, canTransitionTo, getAgentInputSchema, getAgentOutputSchema } from '../src/orchestrator/router.js';
import { type FastTrackContext } from '../src/domain/FastTrack.js';
import { TaskRecord } from '../src/domain/TaskRecord.js';

const buildTask = (overrides: Partial<TaskRecord> = {}): TaskRecord => ({
  id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
  title: 'Test',
  acceptance_criteria: ['AC'],
  scope: 'major',
  status: 'po',
  rev: 0,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  ...overrides
});

describe('Router - Direct Tests', () => {
  it('provides schema mappings per agent', () => {
    expect(getAgentInputSchema('po')).toBe('po_input');
    expect(getAgentOutputSchema('po')).toBe('po_brief');
    expect(getAgentInputSchema('architect')).toBe('po_brief');
    expect(getAgentOutputSchema('architect')).toBe('design_ready');
  });

  it('routes through full state machine including po_check', () => {
    expect(canTransitionTo('po', 'architect')).toBe(true);
    expect(canTransitionTo('arch', 'dev')).toBe(true);
    expect(canTransitionTo('dev', 'reviewer')).toBe(true);
    expect(canTransitionTo('review', 'po')).toBe(true);
    expect(canTransitionTo('po_check', 'qa')).toBe(true);
    expect(canTransitionTo('qa', 'prbot')).toBe(true);
  });

  it('avoids fast-track without evaluation context', () => {
    const tr = buildTask({ scope: 'minor', status: 'po' });
    expect(nextAgent(tr)).toBe('architect');
  });

  it('routes PO to DEV when fast-track evaluation approves', () => {
    const task = buildTask({ scope: 'minor', status: 'po' });
    const ctx: FastTrackContext = {
      task,
      diff: { files: ['src/app.ts'], locAdded: 10, locDeleted: 2 },
      quality: { coverage: 0.9, avgCyclomatic: 3, lintErrors: 0 },
      metadata: { modulesChanged: false, publicApiChanged: false }
    };
    expect(nextAgent(task, { fastTrack: ctx })).toBe('dev');
  });

  it('routes reviewer output to po for PO Check stage', () => {
    const tr = buildTask({ status: 'review' as TaskRecord['status'] });
    expect(nextAgent(tr)).toBe('po');
  });

  it('rejects invalid transitions such as po -> dev without context', () => {
    expect(canTransitionTo('po', 'dev')).toBe(false);
    expect(canTransitionTo('qa', 'architect')).toBe(false);
  });
});
