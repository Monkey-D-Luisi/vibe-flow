import { describe, it, expect } from 'vitest';
import { evaluateGate, resolvePolicy } from '../../src/quality/gate-policy.js';
import { DEFAULT_POLICIES } from '../../src/quality/types.js';

describe('quality gate policy', () => {
  it('resolves known scope policies', () => {
    const major = resolvePolicy(DEFAULT_POLICIES, 'major');
    const minor = resolvePolicy(DEFAULT_POLICIES, 'minor');
    expect(major.coverageMinPct).toBe(80);
    expect(minor.coverageMinPct).toBe(70);
  });

  it('falls back to default policy for unknown scope', () => {
    const policy = resolvePolicy(DEFAULT_POLICIES, 'custom');
    expect(policy).toEqual(DEFAULT_POLICIES.default);
  });

  it('fails when metrics violate policy thresholds', () => {
    const policy = resolvePolicy(DEFAULT_POLICIES, 'major');
    const result = evaluateGate(
      {
        coveragePct: 60,
        lintErrors: 2,
        lintWarnings: 30,
        maxCyclomatic: 30,
        testsExist: true,
        testsPassed: false,
        rgrCount: 5,
      },
      policy,
    );

    expect(result.verdict).toBe('fail');
    expect(result.checks.some((check) => check.name === 'coverage' && check.verdict === 'fail')).toBe(true);
    expect(result.checks.some((check) => check.name === 'tests' && check.verdict === 'fail')).toBe(true);
  });

  it('passes when metrics satisfy policy', () => {
    const policy = resolvePolicy(DEFAULT_POLICIES, 'minor');
    const result = evaluateGate(
      {
        coveragePct: 85,
        lintErrors: 0,
        lintWarnings: 1,
        maxCyclomatic: 8,
        testsExist: true,
        testsPassed: true,
        rgrCount: 1,
      },
      policy,
    );

    expect(result.verdict).toBe('pass');
  });
});
