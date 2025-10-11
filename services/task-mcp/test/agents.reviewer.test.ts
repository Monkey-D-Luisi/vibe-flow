import { describe, it, expect } from 'vitest';
import { validateReviewerInput, validateReviewerReport, REVIEWER_SYSTEM_PROMPT } from '../src/agents/reviewer.js';

describe('Reviewer Agent', () => {
  describe('validateReviewerInput', () => {
    it('should validate valid reviewer input', () => {
      const validInput = {
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
          'GREEN: Implemented UserService.findById'
        ]
      };

      expect(() => validateReviewerInput(validInput)).not.toThrow();
      const result = validateReviewerInput(validInput);
      expect(result.diff_summary).toBe('Implemented UserService with TDD');
      expect(result.metrics.coverage).toBe(0.85);
    });

    it('should reject input missing required fields', () => {
      const invalidInput = {
        diff_summary: 'Test summary',
        metrics: { coverage: 0.8 }
        // missing lint, red_green_refactor_log
      };

      expect(() => validateReviewerInput(invalidInput)).toThrow('Reviewer input validation failed');
    });

    it('should reject coverage outside valid range', () => {
      const invalidInput = {
        diff_summary: 'Test summary',
        metrics: {
          coverage: 1.5, // should be 0-1
          lint: { errors: 0, warnings: 0 }
        },
        red_green_refactor_log: ['Test log']
      };

      expect(() => validateReviewerInput(invalidInput)).toThrow('Reviewer input validation failed');
    });

    it('should reject insufficient red_green_refactor_log entries', () => {
      const invalidInput = {
        diff_summary: 'Test summary',
        metrics: {
          coverage: 0.8,
          lint: { errors: 0, warnings: 0 }
        },
        red_green_refactor_log: ['Only one entry'] // should have at least 2
      };

      expect(() => validateReviewerInput(invalidInput)).toThrow('Reviewer input validation failed');
    });
  });

  describe('validateReviewerReport', () => {
    it('should validate valid reviewer report output', () => {
      const validOutput = {
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

      expect(() => validateReviewerReport(validOutput)).not.toThrow();
      const result = validateReviewerReport(validOutput);
      expect(result.violations).toHaveLength(1);
      expect(result.summary).toBe('Functional code, improvements in separation of responsibilities');
    });

    it('should validate report with no violations', () => {
      const validOutput = {
        violations: [],
        summary: 'Excellent code quality, no violations found'
      };

      expect(() => validateReviewerReport(validOutput)).not.toThrow();
    });

    it('should reject output missing required fields', () => {
      const invalidOutput = {
        violations: []
        // missing summary
      };

      expect(() => validateReviewerReport(invalidOutput)).toThrow('Reviewer report validation failed');
    });

    it('should reject invalid violation structure', () => {
      const invalidOutput = {
        violations: [
          {
            rule: 'SOLID',
            where: 'UserService',
            why: 'Test violation'
            // missing severity, suggested_fix
          }
        ],
        summary: 'Test summary'
      };

      expect(() => validateReviewerReport(invalidOutput)).toThrow('Reviewer report validation failed');
    });

    it('should reject invalid severity', () => {
      const invalidOutput = {
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

      expect(() => validateReviewerReport(invalidOutput)).toThrow('Reviewer report validation failed');
    });
  });

  describe('REVIEWER_SYSTEM_PROMPT', () => {
    it('should contain required instructions', () => {
      expect(REVIEWER_SYSTEM_PROMPT).toContain('You are the REVIEWER agent');
      expect(REVIEWER_SYSTEM_PROMPT).toContain('MANDATORY OUTPUT');
      expect(REVIEWER_SYSTEM_PROMPT).toContain('reviewer_report.schema.json');
      expect(REVIEWER_SYSTEM_PROMPT).toContain('SOLID/Patterns rubric');
    });

    it('should include severity definitions', () => {
      expect(REVIEWER_SYSTEM_PROMPT).toContain('Severity: high=blocks, med=warning, low=improvement');
      expect(REVIEWER_SYSTEM_PROMPT).toContain('severity=high exists, does not allow passing to PO_CHECK');
    });

    it('should include example output', () => {
      expect(REVIEWER_SYSTEM_PROMPT).toContain('Example output:');
      expect(REVIEWER_SYSTEM_PROMPT).toContain('"rule": "SOLID-Single Responsibility"');
      expect(REVIEWER_SYSTEM_PROMPT).toContain('"severity": "med"');
    });
  });
});