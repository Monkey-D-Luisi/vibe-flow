import { describe, it, expect } from 'vitest';
import { nextAgent, canTransitionTo, getAgentInputSchema, getAgentOutputSchema } from '../src/orchestrator/router.js';
import { TaskRecord } from '../src/domain/TaskRecord.js';

describe('Router - Direct Tests', () => {
  it('should handle basic routing logic', () => {
    // Test the core logic without complex objects
    expect(getAgentInputSchema('po')).toBe('po_input');
    expect(getAgentOutputSchema('po')).toBe('po_brief');
    expect(getAgentInputSchema('architect')).toBe('po_brief');
    expect(getAgentOutputSchema('architect')).toBe('design_ready');
  });

  it('should validate transition logic', () => {
    expect(canTransitionTo('po', 'architect')).toBe(true);
    expect(canTransitionTo('arch', 'dev')).toBe(true);
    expect(canTransitionTo('dev', 'reviewer')).toBe(true);
    expect(canTransitionTo('review', 'qa')).toBe(true);
    expect(canTransitionTo('qa', 'prbot')).toBe(true);
  });

  it('should reject invalid transitions', () => {
    expect(canTransitionTo('po', 'dev')).toBe(false);
    expect(canTransitionTo('arch', 'reviewer')).toBe(false);
    expect(canTransitionTo('qa', 'architect')).toBe(false);
  });
});