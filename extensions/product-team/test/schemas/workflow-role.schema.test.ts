import { describe, it, expect } from 'vitest';
import { createValidator } from '../../src/schemas/validator.js';
import {
  PoBriefSchema,
  ArchitecturePlanSchema,
  DevResultSchema,
  QaReportSchema,
  ReviewResultSchema,
} from '../../src/schemas/workflow-role.schema.js';

const validate = createValidator();

describe('workflow role schemas', () => {
  it('should accept valid payloads for all role contracts', () => {
    expect(() =>
      validate(PoBriefSchema, {
        title: 'Task title',
        acceptance_criteria: ['criterion'],
        scope: 'major',
        done_if: ['all checks pass'],
      }),
    ).not.toThrow();

    expect(() =>
      validate(ArchitecturePlanSchema, {
        modules: ['api'],
        contracts: ['task.create'],
        patterns: ['hexagonal'],
        test_plan: ['unit'],
        adr_id: 'ADR-001',
      }),
    ).not.toThrow();

    expect(() =>
      validate(DevResultSchema, {
        diff_summary: 'Implemented feature',
        metrics: {
          coverage: 88,
          lint_clean: true,
        },
        red_green_refactor_log: ['red', 'green'],
      }),
    ).not.toThrow();

    expect(() =>
      validate(QaReportSchema, {
        total: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        evidence: ['report.xml'],
      }),
    ).not.toThrow();

    expect(() =>
      validate(ReviewResultSchema, {
        violations: [],
        overall_verdict: 'approve',
      }),
    ).not.toThrow();
  });

  it('should reject invalid architecture plan payloads', () => {
    expect(() =>
      validate(ArchitecturePlanSchema, {
        modules: ['api'],
        contracts: [],
        patterns: ['hexagonal'],
        test_plan: ['unit'],
        adr_id: '',
      }),
    ).toThrow(/Validation failed/);
  });

  it('should reject invalid review payload severity', () => {
    expect(() =>
      validate(ReviewResultSchema, {
        violations: [
          {
            rule: 'no-any',
            severity: 'fatal',
            message: 'blocked',
          },
        ],
        overall_verdict: 'changes_requested',
      }),
    ).toThrow(/Validation failed/);
  });
});
