/**
 * Tool: quality.gate_enforce
 *
 * Evaluates quality gate policy against collected metrics.
 * Determines pass/fail/warn verdict for workflow transitions.
 *
 * RGR count sources (NO TaskRepository dependency):
 * 1. deps.rgrLogCount (direct injection)
 * 2. deps.loadRgrLogCount() (async loader)
 * 3. RGR_LOG_COUNT environment variable
 */

import { evaluateGate, resolvePolicy, type GateMetrics } from '../gate/policy.js';
import { collectGateMetrics, type GateSourceDeps } from '../gate/sources.js';
import { DEFAULT_POLICIES, type GatePolicy, type GateResult } from '../gate/types.js';
import {
  autoTunePolicy,
  type GateAutoTuneConfig,
  type GateAutoTuneResult,
  type GatePolicyHistorySample,
} from '../gate/auto-tune.js';

interface GateEnforceAutoTuneInput extends GateAutoTuneConfig {
  enabled?: boolean;
}

export interface GateEnforceInput {
  scope?: string;
  policy?: Partial<GatePolicy>;
  metrics?: Partial<GateMetrics>;
  deps?: GateSourceDeps;
  history?: GatePolicyHistorySample[];
  autoTune?: GateEnforceAutoTuneInput;
}

export interface GateEnforceOutput {
  result: GateResult;
  scope: string;
  policy: GatePolicy;
  metrics: GateMetrics;
  tuning?: {
    applied: boolean;
    sampleCount: number;
    adjustments: GateAutoTuneResult['adjustments'];
    reason?: string;
  };
}

function resolveAutoTuneConfig(input?: GateEnforceAutoTuneInput): GateAutoTuneConfig | null {
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

function filterHistoryByScope(
  history: GatePolicyHistorySample[] | undefined,
  scope: string,
): GatePolicyHistorySample[] {
  if (!history || history.length === 0) {
    return [];
  }

  return history.filter((sample) => {
    const sampleScope = sample.scope;
    if (typeof sampleScope !== 'string' || sampleScope.length === 0) {
      return true;
    }
    return sampleScope === scope;
  });
}

/**
 * Execute gate enforcement tool.
 */
export async function gateEnforceTool(input: GateEnforceInput): Promise<GateEnforceOutput> {
  const scope = input.scope || 'default';

  // Resolve policy
  let policy = resolvePolicy(DEFAULT_POLICIES, scope);
  if (input.policy) {
    policy = { ...policy, ...input.policy };
  }

  // Collect metrics from sources (deps + env, NO TaskRepository)
  const collectedMetrics = await collectGateMetrics(input.deps || {});

  // Merge with any directly provided metrics
  const metrics: GateMetrics = {
    ...collectedMetrics,
    ...input.metrics,
  };

  const autoTuneConfig = resolveAutoTuneConfig(input.autoTune);
  let tuning: GateEnforceOutput['tuning'];
  if (autoTuneConfig) {
    const history = filterHistoryByScope(input.history, scope);
    const tuned = autoTunePolicy(policy, history, autoTuneConfig);
    policy = tuned.tunedPolicy;
    tuning = {
      applied: tuned.applied,
      sampleCount: tuned.sampleCount,
      adjustments: tuned.adjustments,
      reason: tuned.reason,
    };
  }

  // Evaluate gate
  const result = evaluateGate(metrics, policy);

  return {
    result,
    scope,
    policy,
    metrics,
    tuning,
  };
}

/**
 * Tool definition for registration.
 */
export const gateEnforceToolDef = {
  name: 'quality.gate_enforce',
  description: 'Evaluate quality gate policy against collected metrics and return pass/fail/warn verdict',
  parameters: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['major', 'minor', 'patch', 'default'],
        description: 'Policy scope to apply',
        default: 'default',
      },
      policy: {
        type: 'object',
        description: 'Override policy values',
        properties: {
          coverageMinPct: { type: 'number' },
          lintMaxErrors: { type: 'number' },
          lintMaxWarnings: { type: 'number' },
          complexityMaxCyclomatic: { type: 'number' },
          testsRequired: { type: 'boolean' },
          testsMustPass: { type: 'boolean' },
          rgrMaxCount: { type: 'number' },
        },
        additionalProperties: false,
      },
      metrics: {
        type: 'object',
        description: 'Directly provided metric values',
        properties: {
          coveragePct: { type: 'number' },
          lintErrors: { type: 'number' },
          lintWarnings: { type: 'number' },
          maxCyclomatic: { type: 'number' },
          testsExist: { type: 'boolean' },
          testsPassed: { type: 'boolean' },
          rgrCount: { type: 'number' },
        },
        additionalProperties: false,
      },
      history: {
        type: 'array',
        description: 'Historical quality metric samples for optional auto-tuning',
        items: {
          type: 'object',
          properties: {
            coveragePct: { type: 'number' },
            lintWarnings: { type: 'number' },
            maxCyclomatic: { type: 'number' },
            scope: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
          additionalProperties: false,
        },
      },
      autoTune: {
        type: 'object',
        description: 'Optional bounded threshold auto-tuning controls',
        properties: {
          enabled: { type: 'boolean' },
          minSamples: { type: 'integer', minimum: 1 },
          smoothingFactor: { type: 'number', minimum: 0, maximum: 1 },
          maxDeltas: {
            type: 'object',
            properties: {
              coverageMinPct: { type: 'number', minimum: 0 },
              lintMaxWarnings: { type: 'number', minimum: 0 },
              complexityMaxCyclomatic: { type: 'number', minimum: 0 },
            },
            additionalProperties: false,
          },
          bounds: {
            type: 'object',
            properties: {
              coverageMinPct: {
                type: 'object',
                properties: {
                  min: { type: 'number', minimum: 0 },
                  max: { type: 'number', minimum: 0 },
                },
                required: ['min', 'max'],
                additionalProperties: false,
              },
              lintMaxWarnings: {
                type: 'object',
                properties: {
                  min: { type: 'number', minimum: 0 },
                  max: { type: 'number', minimum: 0 },
                },
                required: ['min', 'max'],
                additionalProperties: false,
              },
              complexityMaxCyclomatic: {
                type: 'object',
                properties: {
                  min: { type: 'number', minimum: 0 },
                  max: { type: 'number', minimum: 0 },
                },
                required: ['min', 'max'],
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
  execute: async (_id: string, params: Record<string, unknown>) => {
    return gateEnforceTool(params as unknown as GateEnforceInput);
  },
};
