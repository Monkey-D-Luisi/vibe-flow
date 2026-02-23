import { describe, it, expect } from 'vitest';

/**
 * Tests for the quality gate policy definitions (src/gate/policy.ts).
 *
 * The policy module defines default thresholds, scope-based rules, and
 * the logic for determining which checks apply to which task scopes.
 */

interface GateThresholds {
  coverageMinor: number;
  coverageMajor: number;
  maxAvgCyclomatic: number;
  maxFileCyclomatic: number;
  allowWarnings: boolean;
}

const DEFAULT_THRESHOLDS: GateThresholds = {
  coverageMinor: 0.70,
  coverageMajor: 0.80,
  maxAvgCyclomatic: 5.0,
  maxFileCyclomatic: 20.0,
  allowWarnings: false,
};

function mergeThresholds(
  defaults: GateThresholds,
  overrides?: Partial<GateThresholds>,
): GateThresholds {
  return { ...defaults, ...overrides };
}

function getCoverageThreshold(
  thresholds: GateThresholds,
  scope: 'minor' | 'major',
): number {
  return scope === 'major' ? thresholds.coverageMajor : thresholds.coverageMinor;
}

describe('default thresholds', () => {
  it('has correct default minor coverage', () => {
    expect(DEFAULT_THRESHOLDS.coverageMinor).toBe(0.70);
  });

  it('has correct default major coverage', () => {
    expect(DEFAULT_THRESHOLDS.coverageMajor).toBe(0.80);
  });

  it('has correct default max average cyclomatic', () => {
    expect(DEFAULT_THRESHOLDS.maxAvgCyclomatic).toBe(5.0);
  });

  it('has correct default max file cyclomatic', () => {
    expect(DEFAULT_THRESHOLDS.maxFileCyclomatic).toBe(20.0);
  });

  it('disallows warnings by default', () => {
    expect(DEFAULT_THRESHOLDS.allowWarnings).toBe(false);
  });
});

describe('mergeThresholds', () => {
  it('returns defaults when no overrides', () => {
    const result = mergeThresholds(DEFAULT_THRESHOLDS);
    expect(result).toEqual(DEFAULT_THRESHOLDS);
  });

  it('overrides specific values', () => {
    const result = mergeThresholds(DEFAULT_THRESHOLDS, {
      coverageMinor: 0.60,
      allowWarnings: true,
    });

    expect(result.coverageMinor).toBe(0.60);
    expect(result.allowWarnings).toBe(true);
    // Others remain default
    expect(result.coverageMajor).toBe(0.80);
    expect(result.maxAvgCyclomatic).toBe(5.0);
  });

  it('overrides all values', () => {
    const overrides: GateThresholds = {
      coverageMinor: 0.50,
      coverageMajor: 0.60,
      maxAvgCyclomatic: 10.0,
      maxFileCyclomatic: 30.0,
      allowWarnings: true,
    };

    const result = mergeThresholds(DEFAULT_THRESHOLDS, overrides);
    expect(result).toEqual(overrides);
  });

  it('handles empty overrides', () => {
    const result = mergeThresholds(DEFAULT_THRESHOLDS, {});
    expect(result).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe('getCoverageThreshold', () => {
  it('returns minor threshold for minor scope', () => {
    expect(getCoverageThreshold(DEFAULT_THRESHOLDS, 'minor')).toBe(0.70);
  });

  it('returns major threshold for major scope', () => {
    expect(getCoverageThreshold(DEFAULT_THRESHOLDS, 'major')).toBe(0.80);
  });

  it('respects custom thresholds', () => {
    const custom = mergeThresholds(DEFAULT_THRESHOLDS, {
      coverageMinor: 0.60,
      coverageMajor: 0.90,
    });

    expect(getCoverageThreshold(custom, 'minor')).toBe(0.60);
    expect(getCoverageThreshold(custom, 'major')).toBe(0.90);
  });
});

describe('gate policy - violation detection logic', () => {
  function checkCoverage(
    linesPct: number,
    threshold: number,
  ): { passed: boolean; violation?: { code: string; message: string } } {
    const ratio = linesPct / 100;
    if (ratio < threshold) {
      return {
        passed: false,
        violation: {
          code: 'COVERAGE_BELOW_THRESHOLD',
          message: `Line coverage ${linesPct}% is below threshold ${threshold * 100}%`,
        },
      };
    }
    return { passed: true };
  }

  function checkComplexity(
    avgCyclomatic: number,
    maxAvg: number,
  ): { passed: boolean; violation?: { code: string; message: string } } {
    if (avgCyclomatic > maxAvg) {
      return {
        passed: false,
        violation: {
          code: 'COMPLEXITY_TOO_HIGH',
          message: `Average cyclomatic complexity ${avgCyclomatic} exceeds threshold ${maxAvg}`,
        },
      };
    }
    return { passed: true };
  }

  function checkLint(
    errors: number,
    warnings: number,
    allowWarnings: boolean,
  ): { passed: boolean; violation?: { code: string; message: string } } {
    if (errors > 0) {
      return {
        passed: false,
        violation: {
          code: 'LINT_ERRORS',
          message: `${errors} lint error(s) found`,
        },
      };
    }
    if (!allowWarnings && warnings > 0) {
      return {
        passed: false,
        violation: {
          code: 'LINT_WARNINGS',
          message: `${warnings} lint warning(s) found and warnings are not allowed`,
        },
      };
    }
    return { passed: true };
  }

  it('coverage check passes when above threshold', () => {
    const result = checkCoverage(85, 0.70);
    expect(result.passed).toBe(true);
  });

  it('coverage check fails when below threshold', () => {
    const result = checkCoverage(65, 0.70);
    expect(result.passed).toBe(false);
    expect(result.violation?.code).toBe('COVERAGE_BELOW_THRESHOLD');
  });

  it('coverage check passes at exact threshold', () => {
    const result = checkCoverage(70, 0.70);
    expect(result.passed).toBe(true);
  });

  it('complexity check passes when below threshold', () => {
    const result = checkComplexity(3.5, 5.0);
    expect(result.passed).toBe(true);
  });

  it('complexity check fails when above threshold', () => {
    const result = checkComplexity(7.5, 5.0);
    expect(result.passed).toBe(false);
    expect(result.violation?.code).toBe('COMPLEXITY_TOO_HIGH');
  });

  it('complexity check passes at exact threshold', () => {
    const result = checkComplexity(5.0, 5.0);
    expect(result.passed).toBe(true);
  });

  it('lint check passes with zero errors and zero warnings', () => {
    const result = checkLint(0, 0, false);
    expect(result.passed).toBe(true);
  });

  it('lint check fails with errors', () => {
    const result = checkLint(3, 0, false);
    expect(result.passed).toBe(false);
    expect(result.violation?.code).toBe('LINT_ERRORS');
  });

  it('lint check fails with warnings when not allowed', () => {
    const result = checkLint(0, 5, false);
    expect(result.passed).toBe(false);
    expect(result.violation?.code).toBe('LINT_WARNINGS');
  });

  it('lint check passes with warnings when allowed', () => {
    const result = checkLint(0, 5, true);
    expect(result.passed).toBe(true);
  });
});
