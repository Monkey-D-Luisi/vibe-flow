import { describe, it, expect } from 'vitest';
import {
  evaluateStageQuality,
  DEFAULT_STAGE_QUALITY_CONFIG,
  type StageQualityConfig,
} from '../../src/orchestrator/stage-quality-rules.js';

const enabledConfig: StageQualityConfig = { ...DEFAULT_STAGE_QUALITY_CONFIG, enabled: true };
const disabledConfig: StageQualityConfig = { ...DEFAULT_STAGE_QUALITY_CONFIG, enabled: false };

describe('evaluateStageQuality', () => {
  describe('config disabled', () => {
    it('returns no failures when disabled', () => {
      expect(evaluateStageQuality('IMPLEMENTATION', {}, disabledConfig)).toEqual([]);
    });
  });

  describe('non-gated stages', () => {
    it('returns no failures for IDEA stage', () => {
      expect(evaluateStageQuality('IDEA', {}, enabledConfig)).toEqual([]);
    });

    it('returns no failures for ROADMAP stage', () => {
      expect(evaluateStageQuality('ROADMAP', {}, enabledConfig)).toEqual([]);
    });

    it('returns no failures for REFINEMENT stage', () => {
      expect(evaluateStageQuality('REFINEMENT', {}, enabledConfig)).toEqual([]);
    });

    it('returns no failures for DECOMPOSITION stage', () => {
      expect(evaluateStageQuality('DECOMPOSITION', {}, enabledConfig)).toEqual([]);
    });

    it('returns no failures for SHIPPING stage', () => {
      expect(evaluateStageQuality('SHIPPING', {}, enabledConfig)).toEqual([]);
    });
  });

  describe('IMPLEMENTATION stage', () => {
    it('requires dev_result metadata', () => {
      const failures = evaluateStageQuality('IMPLEMENTATION', {}, enabledConfig);
      expect(failures).toHaveLength(1);
      expect(failures[0].rule).toBe('dev_result_required');
    });

    it('requires dev_result.metrics', () => {
      const failures = evaluateStageQuality('IMPLEMENTATION', {
        dev_result: { version: 1 },
      }, enabledConfig);
      expect(failures).toHaveLength(1);
      expect(failures[0].rule).toBe('metrics_required');
    });

    it('passes with valid metrics', () => {
      const failures = evaluateStageQuality('IMPLEMENTATION', {
        dev_result: {
          metrics: { tests_passed: true, coverage: 85, lint_clean: true },
        },
      }, enabledConfig);
      expect(failures).toHaveLength(0);
    });

    it('fails when tests have not passed', () => {
      const failures = evaluateStageQuality('IMPLEMENTATION', {
        dev_result: {
          metrics: { tests_passed: false, coverage: 85, lint_clean: true },
        },
      }, enabledConfig);
      expect(failures.some((f) => f.rule === 'tests_must_pass')).toBe(true);
    });

    it('fails when coverage is below threshold', () => {
      const failures = evaluateStageQuality('IMPLEMENTATION', {
        dev_result: {
          metrics: { tests_passed: true, coverage: 40, lint_clean: true },
        },
      }, enabledConfig);
      expect(failures.some((f) => f.rule === 'coverage_threshold')).toBe(true);
      expect(failures[0].message).toContain('40%');
      expect(failures[0].message).toContain('70%');
    });

    it('fails when lint is not clean', () => {
      const failures = evaluateStageQuality('IMPLEMENTATION', {
        dev_result: {
          metrics: { tests_passed: true, coverage: 85, lint_clean: false },
        },
      }, enabledConfig);
      expect(failures.some((f) => f.rule === 'lint_clean')).toBe(true);
    });

    it('reports multiple failures', () => {
      const failures = evaluateStageQuality('IMPLEMENTATION', {
        dev_result: {
          metrics: { tests_passed: false, coverage: 30, lint_clean: false },
        },
      }, enabledConfig);
      expect(failures).toHaveLength(3);
    });

    it('respects custom coverage threshold', () => {
      const customConfig: StageQualityConfig = { ...enabledConfig, coverageMinPct: 90 };
      const failures = evaluateStageQuality('IMPLEMENTATION', {
        dev_result: {
          metrics: { tests_passed: true, coverage: 85, lint_clean: true },
        },
      }, customConfig);
      expect(failures.some((f) => f.rule === 'coverage_threshold')).toBe(true);
    });

    it('skips coverage check when not a number', () => {
      const failures = evaluateStageQuality('IMPLEMENTATION', {
        dev_result: {
          metrics: { tests_passed: true, lint_clean: true },
        },
      }, enabledConfig);
      expect(failures).toHaveLength(0);
    });
  });

  describe('QA stage', () => {
    it('requires qa_report metadata', () => {
      const failures = evaluateStageQuality('QA', {}, enabledConfig);
      expect(failures).toHaveLength(1);
      expect(failures[0].rule).toBe('qa_report_required');
    });

    it('passes with zero failures', () => {
      const failures = evaluateStageQuality('QA', {
        qa_report: { failed: 0, total: 50 },
      }, enabledConfig);
      expect(failures).toHaveLength(0);
    });

    it('fails when tests have failed', () => {
      const failures = evaluateStageQuality('QA', {
        qa_report: { failed: 3, total: 50 },
      }, enabledConfig);
      expect(failures).toHaveLength(1);
      expect(failures[0].rule).toBe('no_failed_tests');
      expect(failures[0].message).toContain('3');
    });
  });

  describe('REVIEW stage', () => {
    it('requires review_result metadata', () => {
      const failures = evaluateStageQuality('REVIEW', {}, enabledConfig);
      expect(failures).toHaveLength(1);
      expect(failures[0].rule).toBe('review_result_required');
    });

    it('passes with no violations', () => {
      const failures = evaluateStageQuality('REVIEW', {
        review_result: { violations: [] },
      }, enabledConfig);
      expect(failures).toHaveLength(0);
    });

    it('passes with low-severity violations only', () => {
      const failures = evaluateStageQuality('REVIEW', {
        review_result: { violations: [{ severity: 'low', message: 'nit' }] },
      }, enabledConfig);
      expect(failures).toHaveLength(0);
    });

    it('fails with high-severity violations', () => {
      const failures = evaluateStageQuality('REVIEW', {
        review_result: {
          violations: [
            { severity: 'high', message: 'security issue' },
            { severity: 'low', message: 'style nit' },
          ],
        },
      }, enabledConfig);
      expect(failures).toHaveLength(1);
      expect(failures[0].rule).toBe('no_critical_violations');
      expect(failures[0].message).toContain('1');
    });

    it('fails with critical-severity violations', () => {
      const failures = evaluateStageQuality('REVIEW', {
        review_result: {
          violations: [{ severity: 'critical', message: 'data leak' }],
        },
      }, enabledConfig);
      expect(failures).toHaveLength(1);
      expect(failures[0].rule).toBe('no_critical_violations');
    });
  });

  describe('DESIGN stage', () => {
    it('requires design artifact or architecture plan', () => {
      const failures = evaluateStageQuality('DESIGN', {}, enabledConfig);
      expect(failures).toHaveLength(1);
      expect(failures[0].rule).toBe('design_artifact_required');
    });

    it('passes with architecture_plan', () => {
      const failures = evaluateStageQuality('DESIGN', {
        architecture_plan: { adr_id: 'ADR-001' },
      }, enabledConfig);
      expect(failures).toHaveLength(0);
    });

    it('passes with design_artifact', () => {
      const failures = evaluateStageQuality('DESIGN', {
        design_artifact: { screens: ['login'] },
      }, enabledConfig);
      expect(failures).toHaveLength(0);
    });
  });
});
