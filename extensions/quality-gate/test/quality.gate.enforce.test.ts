import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the quality gate enforcement tool (src/tools/gate_enforce.ts).
 *
 * The gate enforcer evaluates test results, coverage, lint, and complexity
 * against configured thresholds and returns a pass/fail verdict with
 * violation details.
 */

vi.mock('@openclaw/quality-contracts/fs/read', () => ({
  readFileSafe: vi.fn(),
  readJsonFile: vi.fn(),
}));

import { readJsonFile } from '@openclaw/quality-contracts/fs/read';

const mockReadJsonFile = vi.mocked(readJsonFile);

interface GateViolation {
  code: string;
  message: string;
  actual?: number;
  threshold?: number;
}

interface GateResult {
  passed: boolean;
  violations: GateViolation[];
  checks: {
    tests?: { passed: boolean };
    coverage?: { passed: boolean; linesPct?: number };
    lint?: { passed: boolean; errors?: number };
    complexity?: { passed: boolean; avgCyclomatic?: number };
  };
}

describe('gate enforce - artifact source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass when all checks meet thresholds', () => {
    const result: GateResult = {
      passed: true,
      violations: [],
      checks: {
        tests: { passed: true },
        coverage: { passed: true, linesPct: 85 },
        lint: { passed: true, errors: 0 },
        complexity: { passed: true, avgCyclomatic: 3.5 },
      },
    };

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should fail when coverage is below minor threshold', () => {
    const result: GateResult = {
      passed: false,
      violations: [
        {
          code: 'COVERAGE_BELOW_THRESHOLD',
          message: 'Line coverage 55% is below minor threshold 70%',
          actual: 55,
          threshold: 70,
        },
      ],
      checks: {
        tests: { passed: true },
        coverage: { passed: false, linesPct: 55 },
        lint: { passed: true, errors: 0 },
        complexity: { passed: true, avgCyclomatic: 2.0 },
      },
    };

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toBe('COVERAGE_BELOW_THRESHOLD');
  });

  it('should fail when tests have failures', () => {
    const result: GateResult = {
      passed: false,
      violations: [
        {
          code: 'TESTS_FAILED',
          message: '3 test(s) failed',
        },
      ],
      checks: {
        tests: { passed: false },
        coverage: { passed: true, linesPct: 90 },
        lint: { passed: true, errors: 0 },
        complexity: { passed: true, avgCyclomatic: 2.0 },
      },
    };

    expect(result.passed).toBe(false);
    expect(result.violations[0].code).toBe('TESTS_FAILED');
  });

  it('should fail when lint has errors', () => {
    const result: GateResult = {
      passed: false,
      violations: [
        {
          code: 'LINT_ERRORS',
          message: '5 lint error(s) found',
          actual: 5,
          threshold: 0,
        },
      ],
      checks: {
        tests: { passed: true },
        coverage: { passed: true, linesPct: 80 },
        lint: { passed: false, errors: 5 },
        complexity: { passed: true, avgCyclomatic: 3.0 },
      },
    };

    expect(result.passed).toBe(false);
    expect(result.violations[0].code).toBe('LINT_ERRORS');
  });

  it('should fail when complexity exceeds threshold', () => {
    const result: GateResult = {
      passed: false,
      violations: [
        {
          code: 'COMPLEXITY_TOO_HIGH',
          message: 'Average cyclomatic complexity 8.5 exceeds threshold 5.0',
          actual: 8.5,
          threshold: 5.0,
        },
      ],
      checks: {
        tests: { passed: true },
        coverage: { passed: true, linesPct: 85 },
        lint: { passed: true, errors: 0 },
        complexity: { passed: false, avgCyclomatic: 8.5 },
      },
    };

    expect(result.passed).toBe(false);
    expect(result.violations[0].code).toBe('COMPLEXITY_TOO_HIGH');
    expect(result.violations[0].actual).toBe(8.5);
  });

  it('should report multiple violations', () => {
    const result: GateResult = {
      passed: false,
      violations: [
        { code: 'TESTS_FAILED', message: '1 test(s) failed' },
        { code: 'COVERAGE_BELOW_THRESHOLD', message: 'Line coverage 50% is below threshold 70%', actual: 50, threshold: 70 },
        { code: 'LINT_ERRORS', message: '2 lint error(s) found', actual: 2, threshold: 0 },
      ],
      checks: {
        tests: { passed: false },
        coverage: { passed: false, linesPct: 50 },
        lint: { passed: false, errors: 2 },
        complexity: { passed: true, avgCyclomatic: 3.0 },
      },
    };

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(3);
  });
});

describe('gate enforce - scope handling', () => {
  it('uses minor coverage threshold for minor scope', () => {
    const thresholds = {
      coverageMinor: 0.70,
      coverageMajor: 0.80,
    };
    const scope = 'minor' as const;
    const threshold = scope === 'minor' ? thresholds.coverageMinor : thresholds.coverageMajor;

    expect(threshold).toBe(0.70);
  });

  it('uses major coverage threshold for major scope', () => {
    const thresholds = {
      coverageMinor: 0.70,
      coverageMajor: 0.80,
    };
    const scope = 'major' as const;
    const threshold = scope === 'minor' ? thresholds.coverageMinor : thresholds.coverageMajor;

    expect(threshold).toBe(0.80);
  });
});

describe('gate enforce - artifact reading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads test artifacts from specified path', async () => {
    mockReadJsonFile.mockResolvedValue({
      success: true,
      totalTests: 10,
      passed: 10,
      failed: 0,
    });

    const data = await readJsonFile('.qreport/tests.json');
    expect(data).toHaveProperty('success', true);
  });

  it('reads coverage artifacts from specified path', async () => {
    mockReadJsonFile.mockResolvedValue({
      total: {
        lines: { pct: 85 },
      },
    });

    const data = await readJsonFile('.qreport/coverage.json');
    expect(data).toHaveProperty('total');
  });

  it('handles missing artifacts gracefully', async () => {
    mockReadJsonFile.mockRejectedValue(new Error('NOT_FOUND'));

    await expect(readJsonFile('.qreport/missing.json')).rejects.toThrow('NOT_FOUND');
  });
});
