import { describe, it, expect } from 'vitest';
import { validateArchitectInput, validateDesignReady, ARCHITECT_SYSTEM_PROMPT } from '../src/agents/architect.js';

describe('Architect Agent', () => {
  describe('validateArchitectInput', () => {
    it('should validate valid architect input', () => {
      const validInput = {
        title: 'Implement user login',
        acceptance_criteria: ['User can login', 'Password is encrypted'],
        scope: 'minor' as const,
        non_functional: ['Security: AES encryption'],
        done_if: ['Login works', 'Security tests pass']
      };

      expect(() => validateArchitectInput(validInput)).not.toThrow();
      const result = validateArchitectInput(validInput);
      expect(result.title).toBe('Implement user login');
      expect(result.scope).toBe('minor');
    });

    it('should reject input missing required fields', () => {
      const invalidInput = {
        title: 'Test task',
        acceptance_criteria: ['Test criteria']
        // missing scope, non_functional, done_if
      };

      expect(() => validateArchitectInput(invalidInput)).toThrow('Architect input validation failed');
    });

    it('should reject invalid scope', () => {
      const invalidInput = {
        title: 'Test task',
        acceptance_criteria: ['Test criteria'],
        scope: 'invalid' as any,
        non_functional: [],
        done_if: []
      };

      expect(() => validateArchitectInput(invalidInput)).toThrow('Architect input validation failed');
    });
  });

  describe('validateDesignReady', () => {
    it('should validate valid design ready output', () => {
      const validOutput = {
        modules: ['UserService', 'AuthModule'],
        contracts: [
          { name: 'UserRepository', methods: ['findById', 'save'] }
        ],
        patterns: [
          { name: 'Repository', where: 'data access', why: 'abstraction over persistence' }
        ],
        adr_id: 'ADR-001',
        test_plan: ['Unit tests for all services', 'Contract tests for APIs']
      };

      expect(() => validateDesignReady(validOutput)).not.toThrow();
      const result = validateDesignReady(validOutput);
      expect(result.modules).toContain('UserService');
      expect(result.adr_id).toBe('ADR-001');
    });

    it('should reject output missing required fields', () => {
      const invalidOutput = {
        modules: ['UserService']
        // missing contracts, patterns, adr_id, test_plan
      };

      expect(() => validateDesignReady(invalidOutput)).toThrow('Design ready validation failed');
    });

    it('should reject invalid ADR format', () => {
      const invalidOutput = {
        modules: ['UserService'],
        contracts: [{ name: 'UserRepository', methods: [] }],
        patterns: [{ name: 'Repository', where: 'data', why: 'test' }],
        adr_id: 'INVALID-ADR', // should match ADR-\d+ format
        test_plan: ['Unit tests']
      };

      expect(() => validateDesignReady(invalidOutput)).toThrow('Design ready validation failed');
    });
  });

  describe('ARCHITECT_SYSTEM_PROMPT', () => {
    it('should contain required instructions', () => {
      expect(ARCHITECT_SYSTEM_PROMPT).toContain('You are the ARCHITECT agent');
      expect(ARCHITECT_SYSTEM_PROMPT).toContain('MANDATORY OUTPUT');
      expect(ARCHITECT_SYSTEM_PROMPT).toContain('design_ready.schema.json');
      expect(ARCHITECT_SYSTEM_PROMPT).toContain('adr_id: string format "ADR-\\d+"');
    });

    it('should include example output', () => {
      expect(ARCHITECT_SYSTEM_PROMPT).toContain('Example output:');
      expect(ARCHITECT_SYSTEM_PROMPT).toContain('"modules": ["UserService", "AuthModule"]');
      expect(ARCHITECT_SYSTEM_PROMPT).toContain('"adr_id": "ADR-001"');
    });
  });
});