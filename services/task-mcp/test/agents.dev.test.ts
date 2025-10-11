import { describe, it, expect } from 'vitest';
import { validateDevInput, validateDevWorkOutput, DEV_SYSTEM_PROMPT } from '../src/agents/dev.js';

describe('Dev Agent', () => {
  describe('validateDevInput', () => {
    it('should validate valid dev input', () => {
      const validInput = {
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

      expect(() => validateDevInput(validInput)).not.toThrow();
      const result = validateDevInput(validInput);
      expect(result.modules).toContain('UserService');
      expect(result.adr_id).toBe('ADR-001');
    });

    it('should reject input missing required fields', () => {
      const invalidInput = {
        modules: ['UserService'],
        contracts: [{ name: 'UserRepository', methods: [] }]
        // missing patterns, adr_id, test_plan
      };

      expect(() => validateDevInput(invalidInput)).toThrow('Dev input validation failed');
    });

    it('should reject invalid contract structure', () => {
      const invalidInput = {
        modules: ['UserService'],
        contracts: [{ name: 'UserRepository' }], // missing methods
        patterns: [{ name: 'Repository', where: 'data', why: 'test' }],
        adr_id: 'ADR-001',
        test_plan: ['Unit tests']
      };

      expect(() => validateDevInput(invalidInput)).toThrow('Dev input validation failed');
    });
  });

  describe('validateDevWorkOutput', () => {
    it('should validate valid dev work output', () => {
      const validOutput = {
        diff_summary: 'Implemented UserService with TDD',
        metrics: {
          coverage: 0.85,
          lint: {
            errors: 0,
            warnings: 2
          }
        },
        red_green_refactor_log: [
          'RED: UserService.findById test fails',
          'GREEN: Implemented UserService.findById',
          'REFACTOR: Extracted interface'
        ]
      };

      expect(() => validateDevWorkOutput(validOutput)).not.toThrow();
      const result = validateDevWorkOutput(validOutput);
      expect(result.diff_summary).toBe('Implemented UserService with TDD');
      expect(result.metrics.coverage).toBe(0.85);
    });

    it('should reject output missing required fields', () => {
      const invalidOutput = {
        diff_summary: 'Test summary'
        // missing metrics, red_green_refactor_log
      };

      expect(() => validateDevWorkOutput(invalidOutput)).toThrow('Dev work output validation failed');
    });

    it('should reject invalid metrics structure', () => {
      const invalidOutput = {
        diff_summary: 'Test summary',
        metrics: {
          coverage: 0.85
          // missing lint
        },
        red_green_refactor_log: ['Test log']
      };

      expect(() => validateDevWorkOutput(invalidOutput)).toThrow('Dev work output validation failed');
    });

    it('should reject coverage outside valid range', () => {
      const invalidOutput = {
        diff_summary: 'Test summary',
        metrics: {
          coverage: 1.5, // should be 0-1
          lint: { errors: 0, warnings: 0 }
        },
        red_green_refactor_log: ['Test log']
      };

      expect(() => validateDevWorkOutput(invalidOutput)).toThrow('Dev work output validation failed');
    });
  });

  describe('DEV_SYSTEM_PROMPT', () => {
    it('should contain required instructions', () => {
      expect(DEV_SYSTEM_PROMPT).toContain('You are the DEV agent');
      expect(DEV_SYSTEM_PROMPT).toContain('MANDATORY OUTPUT');
      expect(DEV_SYSTEM_PROMPT).toContain('dev_work_output.schema.json');
      expect(DEV_SYSTEM_PROMPT).toContain('TDD: first red tests, then green implementation');
    });

    it('should include coverage requirements', () => {
      expect(DEV_SYSTEM_PROMPT).toContain('coverage >= 0.8 (major) | >= 0.7 (minor)');
      expect(DEV_SYSTEM_PROMPT).toContain('lint.errors = 0');
    });

    it('should include example output', () => {
      expect(DEV_SYSTEM_PROMPT).toContain('Example output:');
      expect(DEV_SYSTEM_PROMPT).toContain('"diff_summary": "Added UserService with TDD"');
      expect(DEV_SYSTEM_PROMPT).toContain('"coverage": 0.85');
    });
  });
});


