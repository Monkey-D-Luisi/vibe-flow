import type { ToolDef, ToolDeps } from './index.js';
import {
  QualityGateParams,
  type QualityGateAutoTune as QualityGateAutoTuneInput,
  type QualityGateParams as QualityGateParamsType,
} from '../schemas/quality-gate.schema.js';
import { evaluateGate, resolvePolicy } from '../quality/gate-policy.js';
import { DEFAULT_POLICIES, type GatePolicy } from '../quality/types.js';
import {
  autoTunePolicy,
  type GateAutoTuneConfig,
  type GateAutoTuneResult,
  type GatePolicyHistorySample,
} from '../quality/gate-auto-tune.js';
import {
  beginQualityExecution,
  getTaskOrThrow,
  updateTaskMetadata,
} from './quality-tool-common.js';
import { mergeQualityGateResult } from './quality-metadata.js';

const DEFAULT_HISTORY_WINDOW = 50;

interface QualityGateOutput {
  passed: boolean;
  metrics: {
    tests: {
      total: number;
      failed: number;
    };
    coverage: {
      lines: number;
    };
    lint: {
      errors: number;
      warnings: number;
    };
    complexity: {
      avgCyclomatic: number;
      maxCyclomatic: number;
    };
  };
  violations: Array<{
    code: 'TESTS_FAILED' | 'COVERAGE_BELOW' | 'LINT_ERRORS' | 'COMPLEXITY_HIGH' | 'RGR_MISSING';
    message: string;
  }>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function mapViolationCode(checkName: string): QualityGateOutput['violations'][number]['code'] {
  if (checkName.startsWith('tests')) {
    return 'TESTS_FAILED';
  }
  if (checkName.startsWith('coverage')) {
    return 'COVERAGE_BELOW';
  }
  if (checkName.startsWith('complexity')) {
    return 'COMPLEXITY_HIGH';
  }
  if (checkName.startsWith('rgr')) {
    return 'RGR_MISSING';
  }
  return 'LINT_ERRORS';
}

function resolveCoverageLines(metadata: Record<string, unknown>): number {
  const devResult = asRecord(metadata.dev_result);
  const metrics = devResult ? asRecord(devResult.metrics) : null;
  const coveragePct = metrics ? asNumber(metrics.coverage, NaN) : NaN;
  if (!Number.isNaN(coveragePct)) {
    return coveragePct;
  }

  const quality = asRecord(metadata.quality);
  const coverage = quality ? asRecord(quality.coverage) : null;
  const total = coverage ? asRecord(coverage.total) : null;
  const linesRatio = total ? asNumber(total.lines, NaN) : NaN;
  if (!Number.isNaN(linesRatio)) {
    return Math.round(linesRatio * 10000) / 100;
  }
  return 0;
}

function mergePolicy(base: GatePolicy, overrides?: Partial<GatePolicy>): GatePolicy {
  if (!overrides) {
    return base;
  }
  return {
    ...base,
    ...overrides,
  };
}

function toAutoTuneConfig(input?: QualityGateAutoTuneInput): GateAutoTuneConfig | null {
  if (!input?.enabled) {
    return null;
  }
  return {
    minSamples: input.minSamples,
    smoothingFactor: input.smoothingFactor,
    maxDeltas: input.maxDeltas,
    bounds: input.bounds,
  };
}

function extractHistorySample(
  payload: Record<string, unknown>,
  createdAt: string,
  scope: string,
): GatePolicyHistorySample | null {
  const payloadScope = asOptionalString(payload.scope);
  if (payloadScope && payloadScope !== scope) {
    return null;
  }

  const metrics = asRecord(payload.metrics);
  const coveragePct = metrics ? asOptionalNumber(metrics.coveragePct) : undefined;
  const lintWarnings = metrics ? asOptionalNumber(metrics.lintWarnings) : undefined;
  const maxCyclomatic = metrics ? asOptionalNumber(metrics.maxCyclomatic) : undefined;

  if (
    coveragePct === undefined
    && lintWarnings === undefined
    && maxCyclomatic === undefined
  ) {
    return null;
  }

  return {
    coveragePct,
    lintWarnings,
    maxCyclomatic,
    scope: payloadScope ?? scope,
    timestamp: createdAt,
  };
}

function loadGateHistory(
  deps: ToolDeps,
  scope: string,
  historyWindow: number,
): GatePolicyHistorySample[] {
  const queryResult = deps.eventLog.queryEvents({
    eventType: 'quality.gate',
    limit: historyWindow,
    offset: 0,
  });

  const history: GatePolicyHistorySample[] = [];
  for (const event of queryResult.events) {
    const sample = extractHistorySample(event.payload, event.createdAt, scope);
    if (sample) {
      history.push(sample);
    }
  }

  return history;
}

function buildMetricPayload(
  coveragePct: number,
  lintWarnings: number | undefined,
  maxCyclomatic: number | undefined,
): Record<string, number> {
  const metrics: Record<string, number> = {};
  if (Number.isFinite(coveragePct)) {
    metrics.coveragePct = coveragePct;
  }
  if (lintWarnings !== undefined) {
    metrics.lintWarnings = lintWarnings;
  }
  if (maxCyclomatic !== undefined) {
    metrics.maxCyclomatic = maxCyclomatic;
  }
  return metrics;
}

function toTuningSummary(tuning: GateAutoTuneResult | undefined): Record<string, unknown> | undefined {
  if (!tuning) {
    return undefined;
  }
  return {
    applied: tuning.applied,
    sampleCount: tuning.sampleCount,
    reason: tuning.reason,
    adjustments: tuning.adjustments,
  };
}

export function qualityGateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'quality.gate',
    label: 'Evaluate Quality Gate',
    description: 'Evaluate quality evidence for the task scope and persist gate verdict',
    parameters: QualityGateParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<QualityGateParamsType>(QualityGateParams, params);
      const task = getTaskOrThrow(deps, input.taskId);
      const execCtx = beginQualityExecution(deps, input.taskId, input.agentId);
      const metadata = task.metadata;
      const qaReport = asRecord(metadata.qa_report);
      const quality = asRecord(metadata.quality);
      const lint = quality ? asRecord(quality.lint) : null;
      const complexityRoot = asRecord(metadata.complexity);
      const devResult = asRecord(metadata.dev_result);
      const rgrLog = devResult?.red_green_refactor_log;
      const rgrCount = Array.isArray(rgrLog) ? rgrLog.length : undefined;
      const lintErrors = lint ? asOptionalNumber(lint.errors) : undefined;
      const lintWarnings = lint ? asOptionalNumber(lint.warnings) : undefined;
      const complexityAvg = complexityRoot ? asOptionalNumber(complexityRoot.avg) : undefined;
      const complexityMax = complexityRoot ? asOptionalNumber(complexityRoot.max) : undefined;
      const coveragePct = resolveCoverageLines(metadata);

      const scope = input.scope ?? task.scope;
      const basePolicy = mergePolicy(resolvePolicy(DEFAULT_POLICIES, scope), input.policy);
      let policy = basePolicy;
      let tuning: GateAutoTuneResult | undefined;
      const autoTuneConfig = toAutoTuneConfig(input.autoTune);
      if (autoTuneConfig) {
        const historyWindow = input.autoTune?.historyWindow ?? DEFAULT_HISTORY_WINDOW;
        const history = loadGateHistory(deps, scope, historyWindow);
        tuning = autoTunePolicy(basePolicy, history, autoTuneConfig);
        policy = tuning.tunedPolicy;
      }

      const gateResult = evaluateGate(
        {
          coveragePct,
          lintErrors,
          lintWarnings,
          maxCyclomatic: complexityMax,
          testsExist: !!qaReport,
          testsPassed: qaReport ? asNumber(qaReport.failed) === 0 : false,
          rgrCount,
        },
        policy,
      );

      const output: QualityGateOutput = {
        passed: gateResult.verdict === 'pass' || gateResult.verdict === 'warn',
        metrics: {
          tests: {
            total: qaReport ? asNumber(qaReport.total) : 0,
            failed: qaReport ? asNumber(qaReport.failed) : 0,
          },
          coverage: {
            lines: coveragePct,
          },
          lint: {
            errors: lintErrors ?? 0,
            warnings: lintWarnings ?? 0,
          },
          complexity: {
            avgCyclomatic: complexityAvg ?? 0,
            maxCyclomatic: complexityMax ?? 0,
          },
        },
        violations: gateResult.checks
          .filter((check) => check.verdict === 'fail')
          .map((check) => ({
            code: mapViolationCode(check.name),
            message: check.message,
          })),
      };

      const merged = mergeQualityGateResult(task.metadata, output as unknown as Record<string, unknown>);
      const updatedTask = updateTaskMetadata(deps, task.id, task.rev, merged);
      deps.eventLog.logQualityEvent(
        task.id,
        'quality.gate',
        input.agentId,
        execCtx.correlationId,
        {
          verdict: gateResult.verdict,
          violations: output.violations.length,
          scope,
          metrics: buildMetricPayload(coveragePct, lintWarnings, complexityMax),
          tuning: toTuningSummary(tuning),
        },
      );
      execCtx.logger.info('quality.gate.complete', {
        durationMs: Date.now() - execCtx.startedAt,
        passed: output.passed,
        violations: output.violations.length,
        autoTuneApplied: tuning?.applied ?? false,
        tuningAdjustments: tuning?.adjustments.length ?? 0,
      });

      const result = {
        task: updatedTask,
        output,
        effectivePolicy: policy,
        tuning: tuning ?? null,
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
