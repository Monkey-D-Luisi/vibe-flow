import { describe, it, expect } from 'vitest';
import { validatePrBotInput, validatePrSummary, PR_BOT_SYSTEM_PROMPT } from '../src/agents/prbot.js';

describe('PR Bot Agent', () => {
  describe('validatePrBotInput', () => {
    it('should validate valid PR bot input', () => {
      const validInput = {
        total: 25,
        passed: 23,
        failed: 2,
        evidence: [
          'Unit tests: 20/20 passed',
          'Contract tests: 3/5 failed - API timeout'
        ]
      };

      expect(() => validatePrBotInput(validInput)).not.toThrow();
      const result = validatePrBotInput(validInput);
      expect(result.total).toBe(25);
      expect(result.passed).toBe(23);
      expect(result.failed).toBe(2);
    });

    it('should validate input with all tests passed', () => {
      const validInput = {
        total: 10,
        passed: 10,
        failed: 0,
        evidence: ['All tests passed successfully']
      };

      expect(() => validatePrBotInput(validInput)).not.toThrow();
    });

    it('should reject input missing required fields', () => {
      const invalidInput = {
        total: 10,
        passed: 8,
        failed: 2
        // missing evidence
      };

      expect(() => validatePrBotInput(invalidInput)).toThrow('PR bot input validation failed');
    });

    it('should reject negative test counts', () => {
      const invalidInput = {
        total: 10,
        passed: -1, // should be >= 0
        failed: 2,
        evidence: ['Test evidence']
      };

      expect(() => validatePrBotInput(invalidInput)).toThrow('PR bot input validation failed');
    });
  });

  describe('validatePrSummary', () => {
    it('should validate valid PR summary output', () => {
      const validOutput = {
        branch: 'feature/user-login',
        pr_url: 'https://github.com/org/repo/pull/123',
        checklist: [
          '✅ ACs fulfilled',
          '✅ RGR log: red→green→refactor',
          '✅ Coverage ≥ 80%',
          '✅ Lint 0 errors'
        ]
      };

      expect(() => validatePrSummary(validOutput)).not.toThrow();
      const result = validatePrSummary(validOutput);
      expect(result.branch).toBe('feature/user-login');
      expect(result.pr_url).toBe('https://github.com/org/repo/pull/123');
    });

    it('should reject output missing required fields', () => {
      const invalidOutput = {
        branch: 'feature/test'
        // missing pr_url, checklist
      };

      expect(() => validatePrSummary(invalidOutput)).toThrow('PR summary validation failed');
    });

    it('should reject invalid branch format', () => {
      const invalidOutput = {
        branch: 'invalid-branch-name', // should match feature/[a-z0-9._-]+
        pr_url: 'https://github.com/org/repo/pull/123',
        checklist: ['✅ Test']
      };

      expect(() => validatePrSummary(invalidOutput)).toThrow('PR summary validation failed');
    });

    it('should reject invalid PR URL format', () => {
      const invalidOutput = {
        branch: 'feature/test',
        pr_url: 123, // should be string, not number
        checklist: ['✅ Test']
      };

      expect(() => validatePrSummary(invalidOutput)).toThrow('PR summary validation failed');
    });
  });

  describe('PR_BOT_SYSTEM_PROMPT', () => {
    it('should contain required instructions', () => {
      expect(PR_BOT_SYSTEM_PROMPT).toContain('You are PR-BOT');
      expect(PR_BOT_SYSTEM_PROMPT).toContain('MANDATORY OUTPUT');
      expect(PR_BOT_SYSTEM_PROMPT).toContain('pr_summary.schema.json');
      expect(PR_BOT_SYSTEM_PROMPT).toContain('feature/[task-id] branch');
    });

    it('should include commit gating conditions', () => {
      expect(PR_BOT_SYSTEM_PROMPT).toContain('Commits only if tests pass');
      expect(PR_BOT_SYSTEM_PROMPT).toContain('coverage ≥ 0.8 major / ≥ 0.7 minor');
      expect(PR_BOT_SYSTEM_PROMPT).toContain('lint.errors = 0');
    });

    it('should include checklist requirements', () => {
      expect(PR_BOT_SYSTEM_PROMPT).toContain('ACs, RGR log, coverage, lint, ADR, QA report');
      expect(PR_BOT_SYSTEM_PROMPT).toContain('Automatically link issue');
    });

    it('should include example output', () => {
      expect(PR_BOT_SYSTEM_PROMPT).toContain('Example output:');
      expect(PR_BOT_SYSTEM_PROMPT).toContain('"branch": "feature/user-login"');
      expect(PR_BOT_SYSTEM_PROMPT).toContain('"pr_url": "https://github.com/org/repo/pull/123"');
    });
  });
});