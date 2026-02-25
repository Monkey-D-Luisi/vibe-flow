import { describe, it, expect } from 'vitest';
import {
  evaluateTransitionGuards,
  resolveTransitionGuardConfig,
  DEFAULT_TRANSITION_GUARD_CONFIG,
} from '../../src/orchestrator/transition-guards.js';
import type { TaskRecord, OrchestratorState } from '../../src/domain/task-record.js';

const BASE_TASK: TaskRecord = {
  id: '01TG_TEST_0001',
  title: 'Guard test',
  status: 'in_progress',
  scope: 'major',
  assignee: 'dev',
  tags: [],
  metadata: {
    architecture_plan: {
      modules: ['api'],
      contracts: ['task.create'],
      patterns: ['hexagonal'],
      test_plan: ['unit'],
      adr_id: 'ADR-001',
    },
    dev_result: {
      diff_summary: 'Done',
      metrics: {
        coverage: 90,
        lint_clean: true,
      },
      red_green_refactor_log: ['red', 'green'],
    },
    review_result: {
      violations: [],
      overall_verdict: 'approve',
    },
    qa_report: {
      total: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      evidence: ['report.xml'],
    },
  },
  createdAt: '2026-02-24T12:00:00.000Z',
  updatedAt: '2026-02-24T12:00:00.000Z',
  rev: 0,
};

const BASE_ORCH: OrchestratorState = {
  taskId: BASE_TASK.id,
  current: BASE_TASK.status,
  previous: 'design',
  lastAgent: 'dev',
  roundsReview: 0,
  rev: 0,
  updatedAt: BASE_TASK.updatedAt,
};

describe('transition guards', () => {
  it('should pass when required metadata is present', () => {
    const failures = evaluateTransitionGuards({
      task: BASE_TASK,
      orchestratorState: BASE_ORCH,
      fromStatus: 'in_progress',
      toStatus: 'in_review',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([]);
  });

  it('should return actionable failures when evidence is missing', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      metadata: {
        ...BASE_TASK.metadata,
        dev_result: {
          diff_summary: 'Done',
          metrics: {
            coverage: 60,
            lint_clean: false,
          },
          red_green_refactor_log: ['red'],
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: BASE_ORCH,
      fromStatus: 'in_progress',
      toStatus: 'in_review',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures.map((failure) => failure.field)).toEqual([
      'dev_result.metrics.coverage',
      'dev_result.metrics.lint_clean',
      'dev_result.red_green_refactor_log',
    ]);
  });

  it('should resolve guard config overrides from plugin config', () => {
    const resolved = resolveTransitionGuardConfig({
      transitionGuards: {
        coverage: {
          major: 85,
          minor: 72,
        },
        maxReviewRounds: 4,
      },
    });

    expect(resolved.coverageByScope.major).toBe(85);
    expect(resolved.coverageByScope.minor).toBe(72);
    expect(resolved.coverageByScope.patch).toBe(70);
    expect(resolved.maxReviewRounds).toBe(4);
  });

  it('should reject coverage threshold > 100 and fall back to default', () => {
    const resolved = resolveTransitionGuardConfig({
      transitionGuards: {
        coverage: {
          major: 150,
          minor: 72,
        },
      },
    });

    expect(resolved.coverageByScope.major).toBe(DEFAULT_TRANSITION_GUARD_CONFIG.coverageByScope.major);
    expect(resolved.coverageByScope.minor).toBe(72);
  });

  it('should block in_review -> qa when violations array contains non-object entry', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      status: 'in_review',
      metadata: {
        ...BASE_TASK.metadata,
        review_result: {
          violations: ['critical'],
          overall_verdict: 'changes_requested',
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: { ...BASE_ORCH, current: 'in_review' },
      fromStatus: 'in_review',
      toStatus: 'qa',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures.some((f) => f.field === 'review_result.violations')).toBe(true);
  });

  it('should block in_review -> qa when a violation has unknown/malformed severity', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      status: 'in_review',
      metadata: {
        ...BASE_TASK.metadata,
        review_result: {
          violations: [{ rule: 'no-any', severity: 'fatal', message: 'blocked' }],
          overall_verdict: 'changes_requested',
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: { ...BASE_ORCH, current: 'in_review' },
      fromStatus: 'in_review',
      toStatus: 'qa',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures.some((f) => f.field === 'review_result.violations')).toBe(true);
  });

  it('should block design -> in_progress when contracts contains only empty strings', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      metadata: {
        ...BASE_TASK.metadata,
        architecture_plan: {
          modules: ['api'],
          contracts: ['', '   '],
          patterns: ['hexagonal'],
          test_plan: ['unit'],
          adr_id: 'ADR-001',
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: BASE_ORCH,
      fromStatus: 'design',
      toStatus: 'in_progress',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures.some((f) => f.field === 'architecture_plan.contracts')).toBe(true);
  });

  it('should block design -> in_progress when architecture_plan is missing', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      metadata: {},
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: BASE_ORCH,
      fromStatus: 'design',
      toStatus: 'in_progress',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'architecture_plan',
        message: 'is required for transition design -> in_progress',
      },
    ]);
  });

  it('should block in_progress -> in_review when dev_result is missing', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      metadata: {
        ...BASE_TASK.metadata,
        dev_result: undefined,
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: BASE_ORCH,
      fromStatus: 'in_progress',
      toStatus: 'in_review',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'dev_result',
        message: 'is required for transition in_progress -> in_review. Run quality.coverage and quality.lint first',
      },
    ]);
  });

  it('should block in_progress -> in_review when metrics is not an object', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      metadata: {
        ...BASE_TASK.metadata,
        dev_result: {
          diff_summary: 'Done',
          metrics: 'invalid',
          red_green_refactor_log: ['red', 'green'],
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: BASE_ORCH,
      fromStatus: 'in_progress',
      toStatus: 'in_review',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'dev_result.metrics',
        message: 'must be an object with coverage and lint_clean fields',
      },
    ]);
  });

  it('should block in_progress -> in_review when coverage is not a finite number', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      metadata: {
        ...BASE_TASK.metadata,
        dev_result: {
          diff_summary: 'Done',
          metrics: {
            coverage: 'ninety',
            lint_clean: true,
          },
          red_green_refactor_log: ['red', 'green'],
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: BASE_ORCH,
      fromStatus: 'in_progress',
      toStatus: 'in_review',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'dev_result.metrics.coverage',
        message: 'must be a number',
      },
    ]);
  });

  it('should block in_review -> qa when review_result is missing', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      status: 'in_review',
      metadata: {
        ...BASE_TASK.metadata,
        review_result: undefined,
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: { ...BASE_ORCH, current: 'in_review' },
      fromStatus: 'in_review',
      toStatus: 'qa',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'review_result',
        message: 'is required for transition in_review -> qa',
      },
    ]);
  });

  it('should block in_review -> qa when violations is not an array', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      status: 'in_review',
      metadata: {
        ...BASE_TASK.metadata,
        review_result: {
          violations: 'invalid',
          overall_verdict: 'approve',
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: { ...BASE_ORCH, current: 'in_review' },
      fromStatus: 'in_review',
      toStatus: 'qa',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'review_result.violations',
        message: 'must be an array',
      },
    ]);
  });

  it('should block in_review -> qa when a high severity violation is present', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      status: 'in_review',
      metadata: {
        ...BASE_TASK.metadata,
        review_result: {
          violations: [
            { rule: 'security', severity: 'high', message: 'blocked' },
          ],
          overall_verdict: 'changes_requested',
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: { ...BASE_ORCH, current: 'in_review' },
      fromStatus: 'in_review',
      toStatus: 'qa',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'review_result.violations',
        message: 'must not contain high or critical severity violations',
      },
    ]);
  });

  it('should block qa -> done when qa_report is missing', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      status: 'qa',
      metadata: {
        ...BASE_TASK.metadata,
        qa_report: undefined,
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: { ...BASE_ORCH, current: 'qa' },
      fromStatus: 'qa',
      toStatus: 'done',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'qa_report',
        message: 'is required for transition qa -> done. Run quality.tests first',
      },
    ]);
  });

  it('should block qa -> done when qa_report.failed is not numeric', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      status: 'qa',
      metadata: {
        ...BASE_TASK.metadata,
        qa_report: {
          total: 10,
          passed: 10,
          failed: 'zero',
          skipped: 0,
          evidence: ['report.xml'],
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: { ...BASE_ORCH, current: 'qa' },
      fromStatus: 'qa',
      toStatus: 'done',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'qa_report.failed',
        message: 'must be a number',
      },
    ]);
  });

  it('should block qa -> done when qa_report.failed is non-zero', () => {
    const task: TaskRecord = {
      ...BASE_TASK,
      status: 'qa',
      metadata: {
        ...BASE_TASK.metadata,
        qa_report: {
          total: 10,
          passed: 9,
          failed: 1,
          skipped: 0,
          evidence: ['report.xml'],
        },
      },
    };

    const failures = evaluateTransitionGuards({
      task,
      orchestratorState: { ...BASE_ORCH, current: 'qa' },
      fromStatus: 'qa',
      toStatus: 'done',
      config: DEFAULT_TRANSITION_GUARD_CONFIG,
    });

    expect(failures).toEqual([
      {
        field: 'qa_report.failed',
        message: 'must be 0 (got 1)',
      },
    ]);
  });

  it('should fall back to defaults when transitionGuards config is not an object', () => {
    const resolved = resolveTransitionGuardConfig({
      transitionGuards: 'invalid',
    });

    expect(resolved).toEqual(DEFAULT_TRANSITION_GUARD_CONFIG);
  });

  it('should fall back per field when coverage config is not an object', () => {
    const resolved = resolveTransitionGuardConfig({
      transitionGuards: {
        coverage: 'invalid',
        maxReviewRounds: 5,
      },
    });

    expect(resolved.coverageByScope).toEqual(DEFAULT_TRANSITION_GUARD_CONFIG.coverageByScope);
    expect(resolved.maxReviewRounds).toBe(5);
  });
});
