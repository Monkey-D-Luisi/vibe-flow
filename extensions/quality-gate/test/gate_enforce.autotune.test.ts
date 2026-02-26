import { describe, expect, it } from 'vitest';
import { gateEnforceTool } from '../src/tools/gate_enforce.js';

describe('quality.gate_enforce auto-tune', () => {
  it('applies bounded policy tuning when enabled with sufficient history', async () => {
    const history = Array.from({ length: 6 }, () => ({
      coveragePct: 92,
      lintWarnings: 2,
      maxCyclomatic: 11,
      scope: 'minor',
    }));

    const result = await gateEnforceTool({
      scope: 'minor',
      metrics: {
        coveragePct: 85,
        lintErrors: 0,
        lintWarnings: 4,
        maxCyclomatic: 12,
        testsExist: true,
        testsPassed: true,
        rgrCount: 1,
      },
      history,
      autoTune: {
        enabled: true,
        minSamples: 5,
        smoothingFactor: 0.5,
        maxDeltas: {
          coverageMinPct: 4,
          lintMaxWarnings: 6,
          complexityMaxCyclomatic: 4,
        },
      },
    });

    expect(result.tuning?.applied).toBe(true);
    expect(result.policy.coverageMinPct).toBe(74);
    expect(result.policy.lintMaxWarnings).toBe(14);
    expect(result.policy.complexityMaxCyclomatic).toBe(16);
    expect(result.result.verdict).toBe('pass');
  });

  it('keeps default policy when auto-tune is disabled', async () => {
    const result = await gateEnforceTool({
      scope: 'minor',
      metrics: {
        coveragePct: 85,
        lintErrors: 0,
        lintWarnings: 5,
        maxCyclomatic: 12,
        testsExist: true,
        testsPassed: true,
        rgrCount: 1,
      },
      history: Array.from({ length: 6 }, () => ({
        coveragePct: 95,
        lintWarnings: 1,
        maxCyclomatic: 9,
      })),
      autoTune: {
        enabled: false,
      },
    });

    expect(result.tuning).toBeUndefined();
    expect(result.policy.coverageMinPct).toBe(70);
    expect(result.policy.lintMaxWarnings).toBe(20);
    expect(result.policy.complexityMaxCyclomatic).toBe(20);
  });
});

