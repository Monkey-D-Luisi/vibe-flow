import type { OrchestratorState, TaskRecord } from '../domain/task-record.js';
import type { TaskStatus } from '../domain/task-status.js';

export interface TransitionGuardConfig {
  coverageByScope: {
    major: number;
    minor: number;
    patch: number;
  };
  maxReviewRounds: number;
}

export interface TransitionGuardFailure {
  readonly field: string;
  readonly message: string;
}

export interface TransitionGuardContext {
  readonly task: TaskRecord;
  readonly orchestratorState: OrchestratorState;
  readonly fromStatus: TaskStatus;
  readonly toStatus: TaskStatus;
  readonly config: TransitionGuardConfig;
}

export interface TransitionGuardMatrixItem {
  readonly transition: `${TaskStatus} -> ${TaskStatus}`;
  readonly requirements: readonly string[];
}

export const DEFAULT_TRANSITION_GUARD_CONFIG: TransitionGuardConfig = {
  coverageByScope: {
    major: 80,
    minor: 70,
    patch: 70,
  },
  maxReviewRounds: 3,
};

export const TRANSITION_GUARD_MATRIX: readonly TransitionGuardMatrixItem[] = [
  {
    transition: 'design -> in_progress',
    requirements: [
      'architecture_plan.adr_id is non-empty',
      'architecture_plan.contracts is a non-empty array',
    ],
  },
  {
    transition: 'in_progress -> in_review',
    requirements: [
      'dev_result.metrics.coverage is >= scope threshold',
      'dev_result.metrics.lint_clean is true',
      'dev_result.red_green_refactor_log has at least 2 entries',
    ],
  },
  {
    transition: 'in_review -> qa',
    requirements: [
      'review_result.violations has no high/critical items',
      'orchestrator_state.rounds_review is below configured max',
    ],
  },
  {
    transition: 'qa -> done',
    requirements: [
      'qa_report.failed equals 0',
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function getCoverageThreshold(scope: TaskRecord['scope'], config: TransitionGuardConfig): number {
  return config.coverageByScope[scope];
}

function evaluateDesignToInProgress(task: TaskRecord): TransitionGuardFailure[] {
  const failures: TransitionGuardFailure[] = [];
  const architecturePlan = task.metadata.architecture_plan;

  if (!isRecord(architecturePlan)) {
    return [
      {
        field: 'architecture_plan',
        message: 'is required for transition design -> in_progress',
      },
    ];
  }

  if (!asNonEmptyString(architecturePlan.adr_id)) {
    failures.push({
      field: 'architecture_plan.adr_id',
      message: 'must be a non-empty string',
    });
  }

  if (
    !Array.isArray(architecturePlan.contracts)
    || architecturePlan.contracts.length === 0
    || !architecturePlan.contracts.some((contract) => asNonEmptyString(contract))
  ) {
    failures.push({
      field: 'architecture_plan.contracts',
      message: 'must be a non-empty array with at least one non-empty string entry',
    });
  }

  return failures;
}

function evaluateInProgressToInReview(
  task: TaskRecord,
  config: TransitionGuardConfig,
): TransitionGuardFailure[] {
  const failures: TransitionGuardFailure[] = [];
  const devResult = task.metadata.dev_result;

  if (!isRecord(devResult)) {
    return [
      {
        field: 'dev_result',
        message: 'is required for transition in_progress -> in_review',
      },
    ];
  }

  const metrics = devResult.metrics;
  if (!isRecord(metrics)) {
    failures.push({
      field: 'dev_result.metrics',
      message: 'must be an object with coverage and lint_clean fields',
    });
  } else {
    const coverage = asNumber(metrics.coverage);
    const threshold = getCoverageThreshold(task.scope, config);
    if (coverage === null) {
      failures.push({
        field: 'dev_result.metrics.coverage',
        message: 'must be a number',
      });
    } else if (coverage < threshold) {
      failures.push({
        field: 'dev_result.metrics.coverage',
        message: `must be >= ${threshold} for ${task.scope} scope (got ${coverage})`,
      });
    }

    const lintClean = asBoolean(metrics.lint_clean);
    if (lintClean !== true) {
      failures.push({
        field: 'dev_result.metrics.lint_clean',
        message: 'must be true',
      });
    }
  }

  if (
    !Array.isArray(devResult.red_green_refactor_log)
    || devResult.red_green_refactor_log.length < 2
  ) {
    failures.push({
      field: 'dev_result.red_green_refactor_log',
      message: 'must contain at least 2 entries',
    });
  }

  return failures;
}

function evaluateInReviewToQa(
  task: TaskRecord,
  orchestratorState: OrchestratorState,
  config: TransitionGuardConfig,
): TransitionGuardFailure[] {
  const failures: TransitionGuardFailure[] = [];
  const reviewResult = task.metadata.review_result;

  if (!isRecord(reviewResult)) {
    return [
      {
        field: 'review_result',
        message: 'is required for transition in_review -> qa',
      },
    ];
  }

  const violations = reviewResult.violations;
  if (!Array.isArray(violations)) {
    failures.push({
      field: 'review_result.violations',
      message: 'must be an array',
    });
  } else {
    const hasHighSeverity = violations.some((violation) => {
      if (!isRecord(violation)) {
        // Treat non-object entries conservatively as high severity
        return true;
      }
      const severity = violation.severity;
      if (severity !== 'low' && severity !== 'medium' && severity !== 'high' && severity !== 'critical') {
        // Treat unknown/malformed severities conservatively as high severity
        return true;
      }
      return severity === 'high' || severity === 'critical';
    });
    if (hasHighSeverity) {
      failures.push({
        field: 'review_result.violations',
        message: 'must not contain high or critical severity violations',
      });
    }
  }

  if (orchestratorState.roundsReview >= config.maxReviewRounds) {
    failures.push({
      field: 'orchestrator_state.rounds_review',
      message: `must be < ${config.maxReviewRounds}`,
    });
  }

  return failures;
}

function evaluateQaToDone(task: TaskRecord): TransitionGuardFailure[] {
  const qaReport = task.metadata.qa_report;
  if (!isRecord(qaReport)) {
    return [
      {
        field: 'qa_report',
        message: 'is required for transition qa -> done',
      },
    ];
  }

  const failed = asNumber(qaReport.failed);
  if (failed === null) {
    return [
      {
        field: 'qa_report.failed',
        message: 'must be a number',
      },
    ];
  }

  if (failed !== 0) {
    return [
      {
        field: 'qa_report.failed',
        message: `must be 0 (got ${failed})`,
      },
    ];
  }

  return [];
}

export function evaluateTransitionGuards(context: TransitionGuardContext): TransitionGuardFailure[] {
  const { task, orchestratorState, fromStatus, toStatus, config } = context;
  const transitionKey = `${fromStatus} -> ${toStatus}`;

  if (transitionKey === 'design -> in_progress') {
    return evaluateDesignToInProgress(task);
  }

  if (transitionKey === 'in_progress -> in_review') {
    return evaluateInProgressToInReview(task, config);
  }

  if (transitionKey === 'in_review -> qa') {
    return evaluateInReviewToQa(task, orchestratorState, config);
  }

  if (transitionKey === 'qa -> done') {
    return evaluateQaToDone(task);
  }

  return [];
}

function asCoverageThreshold(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function asPositiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && typeof value === 'number' && value > 0 ? value : null;
}

export function resolveTransitionGuardConfig(workflowConfig: unknown): TransitionGuardConfig {
  if (!isRecord(workflowConfig)) {
    return DEFAULT_TRANSITION_GUARD_CONFIG;
  }

  const guardsConfig = workflowConfig.transitionGuards;
  if (!isRecord(guardsConfig)) {
    return DEFAULT_TRANSITION_GUARD_CONFIG;
  }

  const coverage = isRecord(guardsConfig.coverage)
    ? guardsConfig.coverage
    : {};
  const majorCoverage = asCoverageThreshold(coverage.major);
  const minorCoverage = asCoverageThreshold(coverage.minor);
  const patchCoverage = asCoverageThreshold(coverage.patch);
  const maxReviewRounds = asPositiveInteger(guardsConfig.maxReviewRounds);

  return {
    coverageByScope: {
      major: majorCoverage ?? DEFAULT_TRANSITION_GUARD_CONFIG.coverageByScope.major,
      minor: minorCoverage ?? DEFAULT_TRANSITION_GUARD_CONFIG.coverageByScope.minor,
      patch: patchCoverage ?? DEFAULT_TRANSITION_GUARD_CONFIG.coverageByScope.patch,
    },
    maxReviewRounds: maxReviewRounds ?? DEFAULT_TRANSITION_GUARD_CONFIG.maxReviewRounds,
  };
}
