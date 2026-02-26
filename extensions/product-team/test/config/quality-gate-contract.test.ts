import { describe, expect, it } from 'vitest';
import { QualityGateParams, QualityGatePolicyOverrides } from '../../src/schemas/quality-gate.schema.js';
import { DEFAULT_POLICIES as productPolicies } from '../../src/quality/types.js';
import { DEFAULT_POLICIES as qualityGatePolicies } from '../../../quality-gate/src/gate/types.js';
import { gateEnforceToolDef } from '../../../quality-gate/src/tools/gate_enforce.js';

interface JsonSchemaObject {
  properties?: Record<string, unknown>;
  enum?: unknown[];
  anyOf?: Array<Record<string, unknown>>;
  minimum?: number;
  maximum?: number;
}

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort((left, right) => left.localeCompare(right));
}

function asObject(value: unknown): JsonSchemaObject {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected schema object');
  }
  return value as JsonSchemaObject;
}

describe('quality gate schema/runtime contract', () => {
  it('keeps policy override schema keys aligned with runtime policy keys across both extensions', () => {
    const overrideSchema = asObject(QualityGatePolicyOverrides);
    const overrideProperties = overrideSchema.properties ?? {};
    const productPolicyKeys = sortedKeys(productPolicies.default);
    const qualityGatePolicyKeys = sortedKeys(qualityGatePolicies.default);
    const overrideKeys = sortedKeys(overrideProperties);

    expect(overrideKeys).toEqual(productPolicyKeys);
    expect(qualityGatePolicyKeys).toEqual(productPolicyKeys);

    const gateToolParameters = asObject(gateEnforceToolDef.parameters);
    const toolPolicyObject = asObject(gateToolParameters.properties?.policy);
    const toolPolicyKeys = sortedKeys(toolPolicyObject.properties ?? {});
    expect(toolPolicyKeys).toEqual(productPolicyKeys);
  });

  it('keeps scope semantics aligned between schema and gate tool defaults', () => {
    const qualityGateParamsSchema = asObject(QualityGateParams);
    const scopeSchema = asObject(qualityGateParamsSchema.properties?.scope);
    const productScopes = (scopeSchema.anyOf ?? [])
      .map((entry) => (typeof entry.const === 'string' ? entry.const : null))
      .filter((value): value is string => value !== null)
      .sort((left, right) => left.localeCompare(right));

    expect(productScopes).toEqual(['major', 'minor', 'patch']);

    const gateToolParameters = asObject(gateEnforceToolDef.parameters);
    const gateScope = asObject(gateToolParameters.properties?.scope);
    const gateScopes = (gateScope.enum ?? [])
      .filter((value): value is string => typeof value === 'string')
      .sort((left, right) => left.localeCompare(right));

    expect(gateScopes).toEqual(['default', ...productScopes].sort((left, right) => left.localeCompare(right)));
  });

  it('keeps auto-tune safeguard schema keys aligned across tool surfaces', () => {
    const qualityGateParamsSchema = asObject(QualityGateParams);
    const productAutoTune = asObject(qualityGateParamsSchema.properties?.autoTune);
    const productAutoTuneKeys = sortedKeys(productAutoTune.properties ?? {});
    expect(productAutoTuneKeys).toEqual([
      'bounds',
      'enabled',
      'historyWindow',
      'maxDeltas',
      'minSamples',
      'smoothingFactor',
    ]);

    const gateToolParameters = asObject(gateEnforceToolDef.parameters);
    const qualityGateAutoTune = asObject(gateToolParameters.properties?.autoTune);
    const qualityGateAutoTuneKeys = sortedKeys(qualityGateAutoTune.properties ?? {});
    expect(qualityGateAutoTuneKeys).toEqual([
      'bounds',
      'enabled',
      'maxDeltas',
      'minSamples',
      'smoothingFactor',
    ]);

    const productAutoTuneMaxDeltas = asObject(productAutoTune.properties?.maxDeltas);
    const qualityGateAutoTuneMaxDeltas = asObject(qualityGateAutoTune.properties?.maxDeltas);
    expect(sortedKeys(productAutoTuneMaxDeltas.properties ?? {}))
      .toEqual(sortedKeys(qualityGateAutoTuneMaxDeltas.properties ?? {}));
  });

  it('enforces policy default values within schema bounds', () => {
    const overrideSchema = asObject(QualityGatePolicyOverrides);
    const overrideProperties = overrideSchema.properties ?? {};
    const coverageSchema = asObject(overrideProperties.coverageMinPct);
    const lintErrorsSchema = asObject(overrideProperties.lintMaxErrors);
    const lintWarningsSchema = asObject(overrideProperties.lintMaxWarnings);
    const complexitySchema = asObject(overrideProperties.complexityMaxCyclomatic);
    const rgrSchema = asObject(overrideProperties.rgrMaxCount);

    for (const policy of Object.values(productPolicies)) {
      if (policy.coverageMinPct !== undefined) {
        expect(policy.coverageMinPct).toBeGreaterThanOrEqual(coverageSchema.minimum ?? 0);
        expect(policy.coverageMinPct).toBeLessThanOrEqual(coverageSchema.maximum ?? 100);
      }
      if (policy.lintMaxErrors !== undefined) {
        expect(policy.lintMaxErrors).toBeGreaterThanOrEqual(lintErrorsSchema.minimum ?? 0);
      }
      if (policy.lintMaxWarnings !== undefined) {
        expect(policy.lintMaxWarnings).toBeGreaterThanOrEqual(lintWarningsSchema.minimum ?? 0);
      }
      if (policy.complexityMaxCyclomatic !== undefined) {
        expect(policy.complexityMaxCyclomatic).toBeGreaterThanOrEqual(complexitySchema.minimum ?? 0);
      }
      if (policy.rgrMaxCount !== undefined) {
        expect(policy.rgrMaxCount).toBeGreaterThanOrEqual(rgrSchema.minimum ?? 0);
      }
    }
  });
});
