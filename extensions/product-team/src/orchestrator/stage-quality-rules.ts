/**
 * Stage Quality Rules for Pipeline Advance (EP21, Task 0141)
 *
 * Defines per-stage quality requirements that must be satisfied before
 * a pipeline stage can be advanced. These rules complement the existing
 * transition-guards.ts (which validates workflow status transitions)
 * by adding pipeline-stage-specific quality enforcement.
 */

export interface StageQualityFailure {
  readonly stage: string;
  readonly rule: string;
  readonly message: string;
}

export interface StageQualityConfig {
  readonly coverageMinPct: number;
  readonly enabled: boolean;
}

export const DEFAULT_STAGE_QUALITY_CONFIG: StageQualityConfig = {
  coverageMinPct: 70,
  enabled: true,
};

/**
 * Evaluate stage-specific quality rules for a pipeline advance.
 *
 * @param stage - The current stage being advanced FROM
 * @param meta - Task metadata containing quality artifacts
 * @param config - Quality thresholds
 * @returns Array of failures (empty = can advance)
 */
export function evaluateStageQuality(
  stage: string,
  meta: Record<string, unknown>,
  config: StageQualityConfig = DEFAULT_STAGE_QUALITY_CONFIG,
): StageQualityFailure[] {
  if (!config.enabled) return [];

  switch (stage) {
    case 'IMPLEMENTATION':
      return evaluateImplementation(stage, meta, config);
    case 'QA':
      return evaluateQA(stage, meta);
    case 'REVIEW':
      return evaluateReview(stage, meta);
    case 'DESIGN':
      return evaluateDesign(stage, meta);
    default:
      return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** IMPLEMENTATION: tests must pass, coverage threshold, lint clean. */
function evaluateImplementation(
  stage: string,
  meta: Record<string, unknown>,
  config: StageQualityConfig,
): StageQualityFailure[] {
  const failures: StageQualityFailure[] = [];
  const devResult = meta['dev_result'];

  if (!isRecord(devResult)) {
    return [{
      stage,
      rule: 'dev_result_required',
      message: 'dev_result metadata is required. Run quality checks before advancing.',
    }];
  }

  const metrics = devResult['metrics'];
  if (!isRecord(metrics)) {
    return [{
      stage,
      rule: 'metrics_required',
      message: 'dev_result.metrics is required with coverage, lint, and test data.',
    }];
  }

  // Tests must pass (missing = failure)
  const testsPassed = metrics['tests_passed'];
  if (testsPassed !== true) {
    failures.push({
      stage,
      rule: 'tests_must_pass',
      message: 'Tests must pass before advancing from IMPLEMENTATION.',
    });
  }

  // Coverage threshold
  const coverage = typeof metrics['coverage'] === 'number' ? metrics['coverage'] as number : null;
  if (coverage !== null && coverage < config.coverageMinPct) {
    failures.push({
      stage,
      rule: 'coverage_threshold',
      message: `Coverage ${coverage}% is below minimum ${config.coverageMinPct}%.`,
    });
  }

  // Lint must be clean (missing = failure)
  const lintClean = metrics['lint_clean'];
  if (lintClean !== true) {
    failures.push({
      stage,
      rule: 'lint_clean',
      message: 'Lint errors must be resolved before advancing from IMPLEMENTATION.',
    });
  }

  return failures;
}

/** QA: qa_report required, no failed tests. */
function evaluateQA(
  stage: string,
  meta: Record<string, unknown>,
): StageQualityFailure[] {
  const failures: StageQualityFailure[] = [];
  const qaReport = meta['qa_report'];

  if (!isRecord(qaReport)) {
    return [{
      stage,
      rule: 'qa_report_required',
      message: 'qa_report metadata is required. Run QA checks before advancing.',
    }];
  }

  const failed = typeof qaReport['failed'] === 'number' ? qaReport['failed'] as number : null;
  if (failed === null) {
    failures.push({
      stage,
      rule: 'no_failed_tests',
      message: 'qa_report.failed (number) is required. Run QA checks before advancing.',
    });
  } else if (failed > 0) {
    failures.push({
      stage,
      rule: 'no_failed_tests',
      message: `${failed} test(s) failed. All tests must pass before advancing from QA.`,
    });
  }

  return failures;
}

/** REVIEW: review_result required, no high/critical violations. */
function evaluateReview(
  stage: string,
  meta: Record<string, unknown>,
): StageQualityFailure[] {
  const failures: StageQualityFailure[] = [];
  const reviewResult = meta['review_result'];

  if (!isRecord(reviewResult)) {
    return [{
      stage,
      rule: 'review_result_required',
      message: 'review_result metadata is required before advancing from REVIEW.',
    }];
  }

  const violations = reviewResult['violations'];
  if (!Array.isArray(violations)) {
    failures.push({
      stage,
      rule: 'violations_required',
      message: 'review_result.violations (array) is required before advancing from REVIEW.',
    });
  } else {
    const critical = violations.filter((v) => {
      if (!isRecord(v)) return false;
      const severity = String(v['severity'] ?? '').toLowerCase();
      return severity === 'high' || severity === 'critical';
    });
    if (critical.length > 0) {
      failures.push({
        stage,
        rule: 'no_critical_violations',
        message: `${critical.length} high/critical violation(s) must be resolved before advancing from REVIEW.`,
      });
    }
  }

  return failures;
}

/** DESIGN: architecture_plan or design artifact required. */
function evaluateDesign(
  stage: string,
  meta: Record<string, unknown>,
): StageQualityFailure[] {
  const hasArchPlan = isRecord(meta['architecture_plan']);
  const hasDesignArtifact = isRecord(meta['design_artifact']);

  if (!hasArchPlan && !hasDesignArtifact) {
    return [{
      stage,
      rule: 'design_artifact_required',
      message: 'architecture_plan or design_artifact metadata is required before advancing from DESIGN.',
    }];
  }

  return [];
}
