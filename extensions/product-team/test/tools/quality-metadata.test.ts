import { describe, it, expect } from 'vitest';
import {
  mergeQualityBranch,
  mergeQaReport,
  mergeCoverageMetrics,
  mergeLintMetrics,
  mergeComplexityMetrics,
  mergeQualityGateResult,
} from '../../src/tools/quality-metadata.js';

describe('mergeQualityBranch', () => {
  it('sets quality[key] on an empty metadata object', () => {
    const result = mergeQualityBranch({}, 'tests', { passed: 10 });
    expect((result.quality as Record<string, unknown>)['tests']).toEqual({ passed: 10 });
  });

  it('preserves existing quality keys when adding a new branch entry', () => {
    const meta: Record<string, unknown> = { quality: { tests: { passed: 5 } } };
    const result = mergeQualityBranch(meta, 'coverage', { pct: 90 });
    const quality = result.quality as Record<string, unknown>;
    expect(quality['tests']).toEqual({ passed: 5 });
    expect(quality['coverage']).toEqual({ pct: 90 });
  });

  it('treats a non-object currentMetadata as an empty record', () => {
    const result = mergeQualityBranch(null as unknown as Record<string, unknown>, 'gate', { passed: true });
    expect((result.quality as Record<string, unknown>)['gate']).toEqual({ passed: true });
  });
});

describe('mergeQaReport', () => {
  it('sets qa_report and quality.tests from the provided arguments', () => {
    const qaReport = { summary: 'ok' };
    const testsResult = { passed: 8 };
    const result = mergeQaReport({}, qaReport, testsResult);
    expect(result['qa_report']).toEqual(qaReport);
    expect((result.quality as Record<string, unknown>)['tests']).toEqual(testsResult);
  });
});

describe('mergeCoverageMetrics', () => {
  it('sets dev_result.metrics.coverage and quality.coverage', () => {
    const coverageResult = { pct: 87.5 };
    const result = mergeCoverageMetrics({}, 87.5, coverageResult);
    const devResult = result['dev_result'] as Record<string, unknown>;
    const metrics = devResult['metrics'] as Record<string, unknown>;
    expect(metrics['coverage']).toBe(87.5);
    expect((result.quality as Record<string, unknown>)['coverage']).toEqual(coverageResult);
  });
});

describe('mergeLintMetrics', () => {
  it('sets dev_result.metrics.lint_clean and quality.lint', () => {
    const lintResult = { errors: 0 };
    const result = mergeLintMetrics({}, true, lintResult);
    const devResult = result['dev_result'] as Record<string, unknown>;
    const metrics = devResult['metrics'] as Record<string, unknown>;
    expect(metrics['lint_clean']).toBe(true);
    expect((result.quality as Record<string, unknown>)['lint']).toEqual(lintResult);
  });
});

describe('mergeComplexityMetrics', () => {
  it('builds complexity summary with avg, max, and file count from complexityResult', () => {
    const complexityResult = {
      avgCyclomatic: 3.2,
      maxCyclomatic: 12,
      files: ['a.ts', 'b.ts', 'c.ts'],
    };
    const result = mergeComplexityMetrics({}, complexityResult);
    expect(result['complexity']).toEqual({ avg: 3.2, max: 12, files: 3 });
  });

  it('sets quality.complexity to the full complexityResult', () => {
    const complexityResult = { avgCyclomatic: 2, maxCyclomatic: 5, files: [] };
    const result = mergeComplexityMetrics({}, complexityResult);
    expect((result.quality as Record<string, unknown>)['complexity']).toEqual(complexityResult);
  });
});

describe('mergeQualityGateResult', () => {
  it('sets quality.gate to the provided gate result', () => {
    const gateResult = { passed: true, score: 100 };
    const result = mergeQualityGateResult({}, gateResult);
    expect((result.quality as Record<string, unknown>)['gate']).toEqual(gateResult);
  });
});
