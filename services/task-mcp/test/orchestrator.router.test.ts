import { describe, it, expect } from 'vitest';
import { nextAgent, canTransitionTo, getAgentInputSchema, getAgentOutputSchema, type AgentType } from '../src/orchestrator/router.js';
import { TaskRecord } from '../src/domain/TaskRecord.js';
import { FastTrackContext } from '../src/domain/FastTrack.js';

describe('Router', () => {
  describe('nextAgent', () => {
    it('should route PO to architect for major scope', () => {
      const tr: TaskRecord = {
        id: 'test-1',
        status: 'po',
        scope: 'major',
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rev: 1
      };

      const result = nextAgent(tr);
      expect(result).toBe('architect');
    });

    it('should fast-track PO to dev for minor scope without context', () => {
      const tr: TaskRecord = {
        id: 'test-1',
        status: 'po',
        scope: 'minor',
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rev: 1
      };

      const result = nextAgent(tr);
      expect(result).toBe('dev');
    });

    it('should fast-track PO to dev for minor scope when eligible', () => {
      const tr: TaskRecord = {
        id: 'test-1',
        status: 'po',
        scope: 'minor',
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rev: 1
      };

      const fastTrackCtx: FastTrackContext = {
        task: tr,
        diff: {
          files: ['src/test.ts'],
          locAdded: 10,
          locDeleted: 0
        },
        quality: {
          coverage: 0.9,
          avgCyclomatic: 2.0,
          lintErrors: 0
        },
        metadata: {
          modulesChanged: false,
          publicApiChanged: false
        }
      };

      const result = nextAgent(tr, fastTrackCtx);
      expect(result).toBe('dev');
    });

    it('should route architect to dev', () => {
      const tr: TaskRecord = {
        id: 'test-1',
        status: 'arch',
        scope: 'major',
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rev: 1
      };

      const result = nextAgent(tr);
      expect(result).toBe('dev');
    });

    it('should route dev to reviewer', () => {
      const tr: TaskRecord = {
        id: 'test-1',
        status: 'dev',
        scope: 'major',
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rev: 1
      };

      const result = nextAgent(tr);
      expect(result).toBe('reviewer');
    });

    it('should route reviewer to qa', () => {
      const tr: TaskRecord = {
        id: 'test-1',
        status: 'review',
        scope: 'major',
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rev: 1
      };

      const result = nextAgent(tr);
      expect(result).toBe('qa');
    });

    it('should route qa to prbot', () => {
      const tr: TaskRecord = {
        id: 'test-1',
        status: 'qa',
        scope: 'major',
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rev: 1
      };

      const result = nextAgent(tr);
      expect(result).toBe('prbot');
    });

    it('should return null for pr status (end of flow)', () => {
      const tr: TaskRecord = {
        id: 'test-1',
        status: 'pr',
        scope: 'major',
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rev: 1
      };

      const result = nextAgent(tr);
      expect(result).toBeNull();
    });

    it('should return null for unknown status', () => {
      const tr: TaskRecord = {
        id: 'test-1',
        status: 'unknown' as any,
        scope: 'major',
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rev: 1
      };

      const result = nextAgent(tr);
      expect(result).toBeNull();
    });
  });

  describe('canTransitionTo', () => {
    it('should allow valid transitions', () => {
      expect(canTransitionTo('po', 'architect')).toBe(true);
      expect(canTransitionTo('arch', 'dev')).toBe(true);
      expect(canTransitionTo('dev', 'reviewer')).toBe(true);
      expect(canTransitionTo('review', 'qa')).toBe(true);
      expect(canTransitionTo('qa', 'prbot')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(canTransitionTo('po', 'dev')).toBe(false);
      expect(canTransitionTo('arch', 'reviewer')).toBe(false);
      expect(canTransitionTo('dev', 'qa')).toBe(false);
    });

    it('should handle fast-track transitions', () => {
      // For minor scope, PO can transition directly to dev
      expect(canTransitionTo('po', 'dev')).toBe(false); // This is handled by nextAgent with context
    });
  });

  describe('getAgentInputSchema', () => {
    it('should return correct input schemas', () => {
      expect(getAgentInputSchema('po')).toBe('po_input');
      expect(getAgentInputSchema('architect')).toBe('po_brief');
      expect(getAgentInputSchema('dev')).toBe('design_ready');
      expect(getAgentInputSchema('reviewer')).toBe('dev_work_output');
      expect(getAgentInputSchema('qa')).toBe('reviewer_report');
      expect(getAgentInputSchema('prbot')).toBe('qa_report');
    });
  });

  describe('getAgentOutputSchema', () => {
    it('should return correct output schemas', () => {
      expect(getAgentOutputSchema('po')).toBe('po_brief');
      expect(getAgentOutputSchema('architect')).toBe('design_ready');
      expect(getAgentOutputSchema('dev')).toBe('dev_work_output');
      expect(getAgentOutputSchema('reviewer')).toBe('reviewer_report');
      expect(getAgentOutputSchema('qa')).toBe('qa_report');
      expect(getAgentOutputSchema('prbot')).toBe('pr_summary');
    });
  });
});