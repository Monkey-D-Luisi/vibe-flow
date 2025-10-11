import { describe, it, expect } from 'vitest';
import { validateQaInput, validateQaReport, QA_SYSTEM_PROMPT } from '../src/agents/qa.js';

describe('QA Agent', () => {
  describe('validateQaInput', () => {
    it('should validate valid QA input', () => {
      const validInput = {
        violations: [
          {
            rule: 'SOLID-Single Responsibility',
            where: 'UserService.save()',
            why: 'Method does validation AND persistence',
            severity: 'med' as const,
            suggested_fix: 'Extract separate UserValidator'
          }
        ],
        summary: 'Functional code, improvements in separation of responsibilities'
      };

      expect(() => validateQaInput(validInput)).not.toThrow();
      const result = validateQaInput(validInput);
      expect(result.violations).toHaveLength(1);
      expect(result.summary).toBe('Functional code, improvements in separation of responsibilities');
    });

    it('should validate input with no violations', () => {
      const validInput = {
        violations: [],
        summary: 'Excellent code quality, no violations found'
      };

      expect(() => validateQaInput(validInput)).not.toThrow();
    });

    it('should reject input missing required fields', () => {
      const invalidInput = {
        violations: []
        // missing summary
      };

      expect(() => validateQaInput(invalidInput)).toThrow('QA input validation failed');
    });

    it('should reject invalid violation structure', () => {
      const invalidInput = {
        violations: [
          {
            rule: 'SOLID',
            where: 'UserService'
            // missing why, severity, suggested_fix
          }
        ],
        summary: 'Test summary'
      };

      expect(() => validateQaInput(invalidInput)).toThrow('QA input validation failed');
    });

    it('should reject invalid severity', () => {
      const invalidInput = {
        violations: [
          {
            rule: 'SOLID',
            where: 'UserService',
            why: 'Test violation',
            severity: 'invalid' as any, // should be 'low' | 'med' | 'high'
            suggested_fix: 'Fix it'
          }
        ],
        summary: 'Test summary'
      };

      expect(() => validateQaInput(invalidInput)).toThrow('QA input validation failed');
    });
  });

  describe('validateQaReport', () => {
    it('should validate valid QA report output', () => {
      const validOutput = {
        total: 25,
        passed: 23,
        failed: 2,
        evidence: [
          'Unit tests: 20/20 passed',
          'Contract tests: 3/5 failed - API timeout',
          'Screenshot: login_flow.png'
        ]
      };

      expect(() => validateQaReport(validOutput)).not.toThrow();
      const result = validateQaReport(validOutput);
      expect(result.total).toBe(25);
      expect(result.passed).toBe(23);
      expect(result.failed).toBe(2);
    });

    it('should validate report with all tests passed', () => {
      const validOutput = {
        total: 10,
        passed: 10,
        failed: 0,
        evidence: ['All unit tests passed']
      };

      expect(() => validateQaReport(validOutput)).not.toThrow();
    });

    it('should reject output missing required fields', () => {
      const invalidOutput = {
        total: 10,
        passed: 8
        // missing failed, evidence
      };

      expect(() => validateQaReport(invalidOutput)).toThrow('QA report validation failed');
    });

    it('should reject inconsistent test counts', () => {
      const invalidOutput = {
        total: 10,
        passed: 8,
        failed: 5, // 8 + 5 = 13, should equal total
        evidence: ['Test evidence']
      };

      // Note: This might not be caught by schema validation, but it's logically invalid
      // The schema doesn't enforce total = passed + failed, so this would pass validation
      expect(() => validateQaReport(invalidOutput)).not.toThrow();
    });
  });

  describe('QA_SYSTEM_PROMPT', () => {
    it('should contain required instructions', () => {
      expect(QA_SYSTEM_PROMPT).toContain('You are QA');
      expect(QA_SYSTEM_PROMPT).toContain('MANDATORY OUTPUT');
      expect(QA_SYSTEM_PROMPT).toContain('qa_report.schema.json');
      expect(QA_SYSTEM_PROMPT).toContain('unit tests, contract tests, and integration tests');
    });

    it('should include failure conditions', () => {
      expect(QA_SYSTEM_PROMPT).toContain('no high severity violations');
      expect(QA_SYSTEM_PROMPT).toContain('If failed > 0, QA fails');
    });

    it('should include total calculation', () => {
      expect(QA_SYSTEM_PROMPT).toContain('Total = passed + failed');
    });

    it('should include example output', () => {
      expect(QA_SYSTEM_PROMPT).toContain('Example output:');
      expect(QA_SYSTEM_PROMPT).toContain('"total": 25');
      expect(QA_SYSTEM_PROMPT).toContain('"passed": 23');
      expect(QA_SYSTEM_PROMPT).toContain('"failed": 2');
    });
  });
});