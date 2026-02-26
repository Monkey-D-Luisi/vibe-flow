import { describe, expect, it } from 'vitest';
import { parseEslintOutput as parseEslintProduct } from '../../product-team/src/quality/parsers/eslint.js';
import { parseEslintOutput as parseEslintQualityGate } from '../src/parsers/eslint.js';
import { parseCoverageSummary as parseCoverageSummaryProduct, parseLcov as parseLcovProduct } from '../../product-team/src/quality/parsers/istanbul.js';
import { parseCoverageSummary as parseCoverageSummaryQualityGate, parseLcov as parseLcovQualityGate } from '../src/parsers/istanbul.js';
import { parseVitestOutput as parseVitestProduct } from '../../product-team/src/quality/parsers/vitest.js';
import { parseVitestOutput as parseVitestQualityGate } from '../src/parsers/vitest.js';
import { evaluateGate as evaluateGateProduct, resolvePolicy as resolvePolicyProduct } from '../../product-team/src/quality/gate-policy.js';
import { evaluateGate as evaluateGateQualityGate, resolvePolicy as resolvePolicyQualityGate } from '../src/gate/policy.js';
import { DEFAULT_POLICIES as productPolicies } from '../../product-team/src/quality/types.js';
import { DEFAULT_POLICIES as qualityGatePolicies } from '../src/gate/types.js';

describe('quality contract parity', () => {
  it('keeps default gate policies aligned between product-team and quality-gate', () => {
    expect(qualityGatePolicies).toEqual(productPolicies);
  });

  it('produces identical parser results for ESLint output', () => {
    const input = JSON.stringify([
      {
        filePath: '/src/file.ts',
        errorCount: 1,
        warningCount: 1,
        messages: [
          { ruleId: 'no-unused-vars', severity: 2, message: 'unused value', line: 3, column: 8 },
          { ruleId: 'no-console', severity: 1, message: 'console statement', line: 4, column: 1 },
        ],
      },
    ]);

    expect(parseEslintQualityGate(input)).toEqual(parseEslintProduct(input));
  });

  it('produces identical parser results for coverage summary and lcov', () => {
    const summaryInput = JSON.stringify({
      total: {
        lines: { total: 10, covered: 9, skipped: 0, pct: 90 },
        statements: { total: 10, covered: 9, skipped: 0, pct: 90 },
        functions: { total: 10, covered: 8, skipped: 0, pct: 80 },
        branches: { total: 4, covered: 3, skipped: 0, pct: 75 },
      },
      'src/file.ts': {
        lines: { total: 10, covered: 9, skipped: 0, pct: 90 },
        statements: { total: 10, covered: 9, skipped: 0, pct: 90 },
        functions: { total: 10, covered: 8, skipped: 0, pct: 80 },
        branches: { total: 4, covered: 3, skipped: 0, pct: 75 },
      },
    });
    const lcovInput = [
      'SF:src/file.ts',
      'LF:10',
      'LH:9',
      'FNF:5',
      'FNH:4',
      'BRF:4',
      'BRH:3',
      'end_of_record',
    ].join('\n');

    expect(parseCoverageSummaryQualityGate(summaryInput)).toEqual(parseCoverageSummaryProduct(summaryInput));
    expect(parseLcovQualityGate(lcovInput)).toEqual(parseLcovProduct(lcovInput));
  });

  it('produces identical parser results for Vitest JSON output', () => {
    const input = JSON.stringify({
      success: true,
      numTotalTests: 2,
      numPassedTests: 2,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        {
          filepath: 'test/example.test.ts',
          status: 'passed',
          duration: 11,
          assertionResults: [
            { fullName: 'example test 1', status: 'passed', duration: 5 },
            { fullName: 'example test 2', status: 'passed', duration: 6 },
          ],
        },
      ],
    });

    expect(parseVitestQualityGate(input)).toEqual(parseVitestProduct(input));
  });

  it('evaluates gate policy identically and fails when lint/complexity evidence is missing', () => {
    const productPolicy = resolvePolicyProduct(productPolicies, 'major');
    const qualityGatePolicy = resolvePolicyQualityGate(qualityGatePolicies, 'major');
    expect(qualityGatePolicy).toEqual(productPolicy);

    const metrics = {
      coveragePct: 85,
      testsExist: true,
      testsPassed: true,
      rgrCount: 0,
    };

    const productResult = evaluateGateProduct(metrics, productPolicy);
    const qualityGateResult = evaluateGateQualityGate(metrics, qualityGatePolicy);
    expect(qualityGateResult.verdict).toBe(productResult.verdict);
    expect(qualityGateResult.summary).toBe(productResult.summary);
    expect(qualityGateResult.checks).toEqual(productResult.checks);
    expect(qualityGateResult.verdict).toBe('fail');
    expect(qualityGateResult.checks.some((check) => check.name === 'lint-errors' && check.verdict === 'fail')).toBe(true);
    expect(qualityGateResult.checks.some((check) => check.name === 'complexity' && check.verdict === 'fail')).toBe(true);
  });
});
