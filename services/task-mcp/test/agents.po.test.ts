import { describe, it, expect, vi } from 'vitest';
import { validatePoInput, validatePoBrief, PO_SYSTEM_PROMPT } from '../src/agents/po.js';

// Mock the schema requires
vi.mock('../../../packages/schemas/po_brief.schema.json', () => ({
  default: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      acceptance_criteria: { type: 'array', items: { type: 'string' } },
      scope: { type: 'string', enum: ['minor', 'major'] },
      non_functional: { type: 'array', items: { type: 'string' } },
      done_if: { type: 'array', items: { type: 'string' } }
    },
    required: ['title', 'acceptance_criteria', 'scope', 'non_functional', 'done_if']
  }
}));

describe('PO Agent', () => {
  describe('validatePoInput', () => {
    it('should validate valid PO input', () => {
      const validInput = {
        title: 'Implement user login',
        description: 'Users should be able to login with email and password',
        acceptance_criteria: ['User can login', 'Password is encrypted'],
        scope: 'minor' as const,
        constraints: {
          security: ['AES encryption'],
          performance: ['< 2s response']
        }
      };

      expect(() => validatePoInput(validInput)).not.toThrow();
      const result = validatePoInput(validInput);
      expect(result.title).toBe('Implement user login');
      expect(result.scope).toBe('minor');
    });

    it('should reject input missing required fields', () => {
      const invalidInput = {
        title: 'Test task'
        // missing description, acceptance_criteria, scope
      };

      expect(() => validatePoInput(invalidInput)).toThrow('PO input validation failed');
    });

    it('should reject invalid scope', () => {
      const invalidInput = {
        title: 'Test task',
        description: 'Test description',
        acceptance_criteria: ['Test criteria'],
        scope: 'invalid' // should be 'minor' or 'major'
      };

      expect(() => validatePoInput(invalidInput)).toThrow('PO input validation failed');
    });

    it('should accept input without constraints', () => {
      const validInput = {
        title: 'Simple task',
        description: 'Simple description',
        acceptance_criteria: ['Simple criteria'],
        scope: 'major' as const
      };

      expect(() => validatePoInput(validInput)).not.toThrow();
    });
  });

  describe('validatePoBrief', () => {
    it('should validate valid PO brief output', () => {
      const validOutput = {
        title: 'Implement user login',
        acceptance_criteria: ['User can login', 'Password is encrypted'],
        scope: 'minor' as const,
        non_functional: ['Security: AES encryption', 'Performance: < 2s'],
        done_if: ['Login works', 'Security tests pass']
      };

      expect(() => validatePoBrief(validOutput)).not.toThrow();
      const result = validatePoBrief(validOutput);
      expect(result.title).toBe('Implement user login');
      expect(result.scope).toBe('minor');
    });

    it('should reject output missing required fields', () => {
      const invalidOutput = {
        title: 'Test task',
        acceptance_criteria: ['Test criteria']
        // missing scope, non_functional, done_if
      };

      expect(() => validatePoBrief(invalidOutput)).toThrow('PO brief validation failed');
    });

    it('should reject invalid scope', () => {
      const invalidOutput = {
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        scope: 'invalid' as any, // should be 'minor' or 'major'
        non_functional: [],
        done_if: []
      };

      expect(() => validatePoBrief(invalidOutput)).toThrow('PO brief validation failed');
    });
  });

  describe('PO_SYSTEM_PROMPT', () => {
    it('should contain required instructions', () => {
      expect(PO_SYSTEM_PROMPT).toContain('You are the PO agent');
      expect(PO_SYSTEM_PROMPT).toContain('MANDATORY OUTPUT');
      expect(PO_SYSTEM_PROMPT).toContain('po_brief.schema.json');
      expect(PO_SYSTEM_PROMPT).toContain('scope: "minor" | "major"');
    });

    it('should include example output', () => {
      expect(PO_SYSTEM_PROMPT).toContain('Example output:');
      expect(PO_SYSTEM_PROMPT).toContain('"title": "Implement user login"');
      expect(PO_SYSTEM_PROMPT).toContain('"scope": "minor"');
    });
  });
});