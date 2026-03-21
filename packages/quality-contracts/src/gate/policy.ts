/**
 * Gate policy evaluation logic.
 *
 * Takes metric values and a policy, produces a GateResult.
 */

import type {
  GatePolicy,
  GatePolicySet,
  GateResult,
  GateCheckResult,
  GateVerdict,
} from './types.js';

export interface GateMetrics {
  coveragePct?: number;
  lintErrors?: number;
  lintWarnings?: number;
  maxCyclomatic?: number;
  testsExist?: boolean;
  testsPassed?: boolean;
  rgrCount?: number;
  accessibilityViolations?: number;
  auditCritical?: number;
  auditHigh?: number;
}

function checkCoverage(metrics: GateMetrics, policy: GatePolicy): GateCheckResult | null {
  if (policy.coverageMinPct === undefined) return null;
  if (metrics.coveragePct === undefined) {
    return {
      name: 'coverage',
      verdict: 'skip',
      actual: 'N/A',
      threshold: policy.coverageMinPct,
      message: 'Coverage data not available',
    };
  }

  const pass = metrics.coveragePct >= policy.coverageMinPct;
  return {
    name: 'coverage',
    verdict: pass ? 'pass' : 'fail',
    actual: metrics.coveragePct,
    threshold: policy.coverageMinPct,
    message: pass
      ? `Coverage ${metrics.coveragePct}% meets minimum ${policy.coverageMinPct}%`
      : `Coverage ${metrics.coveragePct}% below minimum ${policy.coverageMinPct}%`,
  };
}

function checkLintErrors(metrics: GateMetrics, policy: GatePolicy): GateCheckResult | null {
  if (policy.lintMaxErrors === undefined) return null;
  if (metrics.lintErrors === undefined) {
    return {
      name: 'lint-errors',
      verdict: 'fail',
      actual: 'N/A',
      threshold: policy.lintMaxErrors,
      message: 'Lint data not available. Run quality.lint first',
    };
  }

  const pass = metrics.lintErrors <= policy.lintMaxErrors;
  return {
    name: 'lint-errors',
    verdict: pass ? 'pass' : 'fail',
    actual: metrics.lintErrors,
    threshold: policy.lintMaxErrors,
    message: pass
      ? `Lint errors (${metrics.lintErrors}) within limit (${policy.lintMaxErrors})`
      : `Lint errors (${metrics.lintErrors}) exceed limit (${policy.lintMaxErrors})`,
  };
}

function checkLintWarnings(metrics: GateMetrics, policy: GatePolicy): GateCheckResult | null {
  if (policy.lintMaxWarnings === undefined) return null;
  if (metrics.lintWarnings === undefined) {
    return {
      name: 'lint-warnings',
      verdict: 'fail',
      actual: 'N/A',
      threshold: policy.lintMaxWarnings,
      message: 'Lint data not available. Run quality.lint first',
    };
  }

  const pass = metrics.lintWarnings <= policy.lintMaxWarnings;
  return {
    name: 'lint-warnings',
    verdict: pass ? 'pass' : (metrics.lintWarnings <= policy.lintMaxWarnings * 2 ? 'warn' : 'fail'),
    actual: metrics.lintWarnings,
    threshold: policy.lintMaxWarnings,
    message: pass
      ? `Lint warnings (${metrics.lintWarnings}) within limit (${policy.lintMaxWarnings})`
      : `Lint warnings (${metrics.lintWarnings}) exceed limit (${policy.lintMaxWarnings})`,
  };
}

function checkComplexity(metrics: GateMetrics, policy: GatePolicy): GateCheckResult | null {
  if (policy.complexityMaxCyclomatic === undefined) return null;
  if (metrics.maxCyclomatic === undefined) {
    return {
      name: 'complexity',
      verdict: 'fail',
      actual: 'N/A',
      threshold: policy.complexityMaxCyclomatic,
      message: 'Complexity data not available. Run quality.complexity first',
    };
  }

  const pass = metrics.maxCyclomatic <= policy.complexityMaxCyclomatic;
  return {
    name: 'complexity',
    verdict: pass ? 'pass' : 'fail',
    actual: metrics.maxCyclomatic,
    threshold: policy.complexityMaxCyclomatic,
    message: pass
      ? `Max cyclomatic complexity (${metrics.maxCyclomatic}) within limit (${policy.complexityMaxCyclomatic})`
      : `Max cyclomatic complexity (${metrics.maxCyclomatic}) exceeds limit (${policy.complexityMaxCyclomatic})`,
  };
}

function checkTests(metrics: GateMetrics, policy: GatePolicy): GateCheckResult | null {
  if (!policy.testsRequired && !policy.testsMustPass) return null;

  if (policy.testsRequired && !metrics.testsExist) {
    return {
      name: 'tests',
      verdict: 'fail',
      actual: false,
      threshold: true,
      message: 'Tests are required but none were found',
    };
  }

  if (policy.testsMustPass && metrics.testsPassed === false) {
    return {
      name: 'tests',
      verdict: 'fail',
      actual: false,
      threshold: true,
      message: 'Tests must pass but some tests failed',
    };
  }

  return {
    name: 'tests',
    verdict: 'pass',
    actual: true,
    threshold: true,
    message: 'Tests pass',
  };
}

function checkRgr(metrics: GateMetrics, policy: GatePolicy): GateCheckResult | null {
  if (policy.rgrMaxCount === undefined) return null;
  if (metrics.rgrCount === undefined) {
    return {
      name: 'rgr-count',
      verdict: 'skip',
      actual: 'N/A',
      threshold: policy.rgrMaxCount,
      message: 'RGR count not available',
    };
  }

  const pass = metrics.rgrCount <= policy.rgrMaxCount;
  return {
    name: 'rgr-count',
    verdict: pass ? 'pass' : 'fail',
    actual: metrics.rgrCount,
    threshold: policy.rgrMaxCount,
    message: pass
      ? `RGR count (${metrics.rgrCount}) within limit (${policy.rgrMaxCount})`
      : `RGR count (${metrics.rgrCount}) exceeds limit (${policy.rgrMaxCount})`,
  };
}

function checkAccessibility(metrics: GateMetrics, policy: GatePolicy): GateCheckResult | null {
  if (policy.accessibilityMaxViolations === undefined) return null;
  if (metrics.accessibilityViolations === undefined) {
    return {
      name: 'accessibility',
      verdict: 'skip',
      actual: 'N/A',
      threshold: policy.accessibilityMaxViolations,
      message: 'Accessibility data not available',
    };
  }

  const pass = metrics.accessibilityViolations <= policy.accessibilityMaxViolations;
  return {
    name: 'accessibility',
    verdict: pass ? 'pass' : 'fail',
    actual: metrics.accessibilityViolations,
    threshold: policy.accessibilityMaxViolations,
    message: pass
      ? `Accessibility violations (${metrics.accessibilityViolations}) within limit (${policy.accessibilityMaxViolations})`
      : `Accessibility violations (${metrics.accessibilityViolations}) exceed limit (${policy.accessibilityMaxViolations})`,
  };
}

function checkAuditCritical(metrics: GateMetrics, policy: GatePolicy): GateCheckResult | null {
  if (policy.auditMaxCritical === undefined) return null;
  if (metrics.auditCritical === undefined) {
    return {
      name: 'audit-critical',
      verdict: 'skip',
      actual: 'N/A',
      threshold: policy.auditMaxCritical,
      message: 'Audit data not available',
    };
  }

  const pass = metrics.auditCritical <= policy.auditMaxCritical;
  return {
    name: 'audit-critical',
    verdict: pass ? 'pass' : 'fail',
    actual: metrics.auditCritical,
    threshold: policy.auditMaxCritical,
    message: pass
      ? `Critical audit vulnerabilities (${metrics.auditCritical}) within limit (${policy.auditMaxCritical})`
      : `Critical audit vulnerabilities (${metrics.auditCritical}) exceed limit (${policy.auditMaxCritical})`,
  };
}

function checkAuditHigh(metrics: GateMetrics, policy: GatePolicy): GateCheckResult | null {
  if (policy.auditMaxHigh === undefined) return null;
  if (metrics.auditHigh === undefined) {
    return {
      name: 'audit-high',
      verdict: 'skip',
      actual: 'N/A',
      threshold: policy.auditMaxHigh,
      message: 'Audit data not available',
    };
  }

  const pass = metrics.auditHigh <= policy.auditMaxHigh;
  return {
    name: 'audit-high',
    verdict: pass ? 'pass' : 'fail',
    actual: metrics.auditHigh,
    threshold: policy.auditMaxHigh,
    message: pass
      ? `High audit vulnerabilities (${metrics.auditHigh}) within limit (${policy.auditMaxHigh})`
      : `High audit vulnerabilities (${metrics.auditHigh}) exceed limit (${policy.auditMaxHigh})`,
  };
}

/**
 * Resolve which policy to use based on scope.
 */
export function resolvePolicy(
  policies: GatePolicySet,
  scope?: string,
): GatePolicy {
  if (scope && scope in policies) {
    return policies[scope as keyof GatePolicySet];
  }
  return policies.default;
}

/**
 * Evaluate gate policy against metrics.
 */
export function evaluateGate(metrics: GateMetrics, policy: GatePolicy): GateResult {
  const checkers = [
    checkCoverage,
    checkLintErrors,
    checkLintWarnings,
    checkComplexity,
    checkTests,
    checkRgr,
    checkAccessibility,
    checkAuditCritical,
    checkAuditHigh,
  ];

  const checks: GateCheckResult[] = [];
  for (const checker of checkers) {
    const result = checker(metrics, policy);
    if (result) {
      checks.push(result);
    }
  }

  // Overall verdict: fail if any check fails, warn if any warns, pass otherwise
  let verdict: GateVerdict = 'pass';
  for (const check of checks) {
    if (check.verdict === 'fail') {
      verdict = 'fail';
      break;
    }
    if (check.verdict === 'warn') {
      verdict = 'warn';
    }
  }

  const failedChecks = checks.filter((c) => c.verdict === 'fail');
  const warnChecks = checks.filter((c) => c.verdict === 'warn');
  const passedChecks = checks.filter((c) => c.verdict === 'pass');

  let summary: string;
  if (verdict === 'fail') {
    summary = `Gate FAILED: ${failedChecks.length} check(s) failed - ${failedChecks.map((c) => c.name).join(', ')}`;
  } else if (verdict === 'warn') {
    summary = `Gate WARN: ${warnChecks.length} warning(s) - ${warnChecks.map((c) => c.name).join(', ')}`;
  } else {
    summary = `Gate PASSED: ${passedChecks.length} check(s) passed`;
  }

  return {
    verdict,
    checks,
    summary,
    timestamp: new Date().toISOString(),
  };
}
