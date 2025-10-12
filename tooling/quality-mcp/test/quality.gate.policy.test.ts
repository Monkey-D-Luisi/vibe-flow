import { describe, expect, it } from 'vitest';
import { evaluateGate, DEFAULT_THRESHOLDS } from '../src/gate/policy.js';
import type { GateMetrics } from '../src/gate/types.js';

const baseMetrics: GateMetrics = {
  tests: { total: 10, failed: 0 },
  coverage: { lines: 0.85 },
  lint: { errors: 0, warnings: 0 },
  complexity: { avgCyclomatic: 3.4, maxCyclomatic: 7.2 }
};

describe('quality gate policy', () => {
  it('passes when metrics meet default thresholds', () => {
    const result = evaluateGate({
      metrics: baseMetrics,
      scope: 'major'
    });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when coverage below threshold', () => {
    const result = evaluateGate({
      metrics: {
        ...baseMetrics,
        coverage: { lines: 0.6 }
      },
      scope: 'major'
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: 'COVERAGE_BELOW' })
    );
  });

  it('fails when tests fail and RGR is insufficient', () => {
    const result = evaluateGate({
      metrics: {
        ...baseMetrics,
        tests: { total: 12, failed: 2 }
      },
      scope: 'minor',
      rgrLogCount: 1
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TESTS_FAILED' }),
        expect.objectContaining({ code: 'RGR_MISSING' })
      ])
    );
  });

  it('fails when warnings are disallowed', () => {
    const result = evaluateGate({
      metrics: {
        ...baseMetrics,
        lint: { errors: 0, warnings: 3 }
      },
      scope: 'minor',
      thresholds: { ...DEFAULT_THRESHOLDS, allowWarnings: false }
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: 'LINT_ERRORS' })
    );
  });

  it('fails when complexity exceeds limits', () => {
    const result = evaluateGate({
      metrics: {
        ...baseMetrics,
        complexity: { avgCyclomatic: 6, maxCyclomatic: 14 }
      },
      scope: 'major'
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: 'COMPLEXITY_HIGH' })
    );
  });
});
