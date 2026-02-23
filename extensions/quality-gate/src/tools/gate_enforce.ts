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

export interface GateEnforceInput {
  scope?: string;
  policy?: Partial<GatePolicy>;
  metrics?: Partial<GateMetrics>;
  deps?: GateSourceDeps;
}

export interface GateEnforceOutput {
  result: GateResult;
  scope: string;
  policy: GatePolicy;
  metrics: GateMetrics;
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

  // Evaluate gate
  const result = evaluateGate(metrics, policy);

  return {
    result,
    scope,
    policy,
    metrics,
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
    },
    additionalProperties: false,
  },
  execute: async (_id: string, params: Record<string, unknown>) => {
    return gateEnforceTool(params as unknown as GateEnforceInput);
  },
};
