import { describe, it, expect } from 'vitest';
import { runAgent, validateAgentOutput } from '../src/orchestrator/runner';
import { AgentType } from '../src/orchestrator/router';

describe('Agent Contract Tests', () => {
  describe('PO Agent', () => {
    it('should produce valid po_brief output', async () => {
      const input = {
        title: 'Implement user login',
        description: 'Users should be able to login with email and password',
        acceptance_criteria: ['User can login', 'Password is encrypted'],
        scope: 'minor' as const,
        constraints: {
          security: ['AES encryption'],
          performance: ['< 2s response']
        }
      };

      const output = await runAgent('po', input);
      const validated = validateAgentOutput('po', output);

      expect(validated).toHaveProperty('title');
      expect(validated).toHaveProperty('acceptance_criteria');
      expect(validated).toHaveProperty('scope');
      expect(validated).toHaveProperty('non_functional');
      expect(validated).toHaveProperty('done_if');
      expect(Array.isArray(validated.non_functional)).toBe(true);
      expect(Array.isArray(validated.done_if)).toBe(true);
    });
  });

  describe('Architect Agent', () => {
    it('should produce valid design_ready output', async () => {
      const input = {
        title: 'Implement user login',
        acceptance_criteria: ['User can login', 'Password is encrypted'],
        scope: 'minor' as const,
        non_functional: ['Security: AES encryption'],
        done_if: ['Login works', 'Password encrypted']
      };

      const output = await runAgent('architect', input);
      const validated = validateAgentOutput('architect', output);

      expect(validated).toHaveProperty('modules');
      expect(validated).toHaveProperty('contracts');
      expect(validated).toHaveProperty('patterns');
      expect(validated).toHaveProperty('adr_id');
      expect(validated).toHaveProperty('test_plan');
      expect(Array.isArray(validated.modules)).toBe(true);
      expect(Array.isArray(validated.contracts)).toBe(true);
      expect(Array.isArray(validated.patterns)).toBe(true);
      expect(typeof validated.adr_id).toBe('string');
      expect(validated.adr_id).toMatch(/^ADR-\d+$/);
    });
  });

  describe('Dev Agent', () => {
    it('should produce valid dev_work_output with quality gates', async () => {
      const input = {
        modules: ['UserService'],
        contracts: [{ name: 'UserRepository', methods: ['findById'] }],
        patterns: [{ name: 'Repository', where: 'data', why: 'abstraction' }],
        adr_id: 'ADR-001',
        test_plan: ['Unit tests']
      };

      const output = await runAgent('dev', input);
      const validated = validateAgentOutput('dev', output);

      expect(validated).toHaveProperty('diff_summary');
      expect(validated).toHaveProperty('metrics');
      expect(validated).toHaveProperty('red_green_refactor_log');
      expect(validated.metrics).toHaveProperty('coverage');
      expect(validated.metrics).toHaveProperty('lint');
      expect(validated.metrics.coverage).toBeGreaterThanOrEqual(0.7);
      expect(validated.metrics.lint.errors).toBe(0);
      expect(Array.isArray(validated.red_green_refactor_log)).toBe(true);
      expect(validated.red_green_refactor_log.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Reviewer Agent', () => {
    it('should produce valid reviewer_report output', async () => {
      const input = {
        diff_summary: 'Implemented UserService',
        metrics: { coverage: 0.85, lint: { errors: 0, warnings: 2 } },
        red_green_refactor_log: ['RED: test fails', 'GREEN: implemented']
      };

      const output = await runAgent('reviewer', input);
      const validated = validateAgentOutput('reviewer', output);

      expect(validated).toHaveProperty('violations');
      expect(validated).toHaveProperty('summary');
      expect(Array.isArray(validated.violations)).toBe(true);

      validated.violations.forEach((violation: any) => {
        expect(violation).toHaveProperty('rule');
        expect(violation).toHaveProperty('where');
        expect(violation).toHaveProperty('why');
        expect(violation).toHaveProperty('severity');
        expect(violation).toHaveProperty('suggested_fix');
        expect(['low', 'med', 'high']).toContain(violation.severity);
      });
    });
  });

  describe('QA Agent', () => {
    it('should produce valid qa_report output', async () => {
      const input = {
        violations: [{
          rule: 'SOLID',
          where: 'UserService',
          why: 'Single responsibility',
          severity: 'med' as const,
          suggested_fix: 'Extract validator'
        }],
        summary: 'Good implementation'
      };

      const output = await runAgent('qa', input);
      const validated = validateAgentOutput('qa', output);

      expect(validated).toHaveProperty('total');
      expect(validated).toHaveProperty('passed');
      expect(validated).toHaveProperty('failed');
      expect(validated).toHaveProperty('evidence');
      expect(typeof validated.total).toBe('number');
      expect(typeof validated.passed).toBe('number');
      expect(typeof validated.failed).toBe('number');
      expect(validated.total).toBe(validated.passed + validated.failed);
      expect(Array.isArray(validated.evidence)).toBe(true);
    });
  });

  describe('PR Bot Agent', () => {
    it('should produce valid pr_summary output', async () => {
      const input = {
        total: 25,
        passed: 23,
        failed: 2,
        evidence: ['Unit tests passed', 'Integration failed']
      };

      const output = await runAgent('prbot', input);
      const validated = validateAgentOutput('prbot', output);

      expect(validated).toHaveProperty('branch');
      expect(validated).toHaveProperty('pr_url');
      expect(validated).toHaveProperty('checklist');
      expect(typeof validated.branch).toBe('string');
      expect(validated.branch).toMatch(/^feature\/[a-z0-9._-]+$/);
      expect(typeof validated.pr_url).toBe('string');
      expect(validated.pr_url).toMatch(/^https:\/\/github\.com\//);
      expect(Array.isArray(validated.checklist)).toBe(true);
    });
  });
});