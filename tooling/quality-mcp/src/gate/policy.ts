import type { GateMetrics, GateResult, GateScope, GateThresholds, GateViolation } from './types.js';

export const DEFAULT_THRESHOLDS: GateThresholds = {
  coverageMinor: 0.7,
  coverageMajor: 0.8,
  maxAvgCyclomatic: 5,
  maxFileCyclomatic: 12,
  allowWarnings: true
};

const formatPercentage = (value: number): string =>
  `${Math.round(value * 1000) / 10}%`;

export interface EvaluateGateOptions {
  metrics: GateMetrics;
  scope: GateScope;
  thresholds?: Partial<GateThresholds>;
  rgrLogCount?: number;
}

export function evaluateGate(options: EvaluateGateOptions): GateResult {
  const thresholds: GateThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...options.thresholds
  };

  const violations: GateViolation[] = [];
  const { metrics } = options;

  if (metrics.tests.failed > 0) {
    violations.push({
      code: 'TESTS_FAILED',
      message: `Detected ${metrics.tests.failed} failed test${metrics.tests.failed === 1 ? '' : 's'} (total ${metrics.tests.total}).`
    });
  }

  if (typeof options.rgrLogCount === 'number' && options.rgrLogCount < 2) {
    violations.push({
      code: 'RGR_MISSING',
      message: `RGR log requires at least 2 entries (found ${options.rgrLogCount}).`
    });
  }

  const requiredCoverage =
    options.scope === 'major' ? thresholds.coverageMajor : thresholds.coverageMinor;
  if (metrics.coverage.lines < requiredCoverage) {
    violations.push({
      code: 'COVERAGE_BELOW',
      message: `Line coverage ${formatPercentage(metrics.coverage.lines)} is below required ${formatPercentage(requiredCoverage)} (scope ${options.scope}).`
    });
  }

  if (metrics.lint.errors > 0) {
    violations.push({
      code: 'LINT_ERRORS',
      message: `Lint found ${metrics.lint.errors} error${metrics.lint.errors === 1 ? '' : 's'}.`
    });
  } else if (!thresholds.allowWarnings && metrics.lint.warnings > 0) {
    violations.push({
      code: 'LINT_ERRORS',
      message: `Lint warnings are not allowed (found ${metrics.lint.warnings}).`
    });
  }

  if (
    metrics.complexity.avgCyclomatic > thresholds.maxAvgCyclomatic ||
    metrics.complexity.maxCyclomatic > thresholds.maxFileCyclomatic
  ) {
    const avg = metrics.complexity.avgCyclomatic.toFixed(2);
    const max = metrics.complexity.maxCyclomatic.toFixed(2);
    violations.push({
      code: 'COMPLEXITY_HIGH',
      message: `Complexity too high (avg ${avg} / max ${max}; allowed avg <= ${thresholds.maxAvgCyclomatic}, max <= ${thresholds.maxFileCyclomatic}).`
    });
  }

  return {
    passed: violations.length === 0,
    metrics,
    violations
  };
}
