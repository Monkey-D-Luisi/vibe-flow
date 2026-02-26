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

  it('filters scoped history samples to the requested policy scope', async () => {
    const majorHistory = Array.from({ length: 6 }, () => ({
      coveragePct: 95,
      lintWarnings: 1,
      maxCyclomatic: 8,
      scope: 'major',
    }));
    const patchHistory = Array.from({ length: 6 }, () => ({
      coveragePct: 60,
      lintWarnings: 30,
      maxCyclomatic: 25,
      scope: 'patch',
    }));

    const result = await gateEnforceTool({
      scope: 'major',
      metrics: {
        coveragePct: 90,
        lintErrors: 0,
        lintWarnings: 4,
        maxCyclomatic: 10,
        testsExist: true,
        testsPassed: true,
        rgrCount: 0,
      },
      history: [...majorHistory, ...patchHistory],
      autoTune: {
        enabled: true,
        minSamples: 5,
        smoothingFactor: 0.5,
        maxDeltas: {
          coverageMinPct: 20,
          lintMaxWarnings: 20,
          complexityMaxCyclomatic: 20,
        },
      },
    });

    expect(result.tuning?.applied).toBe(true);
    expect(result.tuning?.sampleCount).toBe(6);
    expect(result.policy.coverageMinPct).toBe(87.5);
    expect(result.policy.lintMaxWarnings).toBe(6);
    expect(result.policy.complexityMaxCyclomatic).toBe(11.5);
    expect(result.result.verdict).toBe('pass');
  });

  it('emits regression alerts when configured deltas are exceeded', async () => {
    const result = await gateEnforceTool({
      scope: 'minor',
      metrics: {
        coveragePct: 82,
        lintErrors: 0,
        lintWarnings: 2,
        maxCyclomatic: 14,
        testsExist: true,
        testsPassed: true,
        rgrCount: 1,
      },
      history: [
        {
          coveragePct: 95,
          lintWarnings: 0,
          maxCyclomatic: 8,
          scope: 'minor',
          timestamp: '2026-02-26T10:00:00.000Z',
        },
      ],
      alerts: {
        enabled: true,
        thresholds: {
          coverageDropPct: 5,
          complexityRise: 3,
        },
      },
    });

    expect(result.alerting?.alerts).toHaveLength(2);
    expect(result.alerting?.alerts.some((alert) => alert.metric === 'coverageDropPct')).toBe(true);
    expect(result.alerting?.alerts.some((alert) => alert.metric === 'complexityRise')).toBe(true);
    expect(result.alerting?.emittedKeys).toHaveLength(2);
  });

  it('suppresses repeated identical alert keys within cooldown window', async () => {
    const baselineResult = await gateEnforceTool({
      scope: 'minor',
      metrics: {
        coveragePct: 90,
        lintErrors: 0,
        lintWarnings: 0,
        maxCyclomatic: 10,
        testsExist: true,
        testsPassed: true,
        rgrCount: 0,
      },
      history: [
        {
          coveragePct: 90,
          lintWarnings: 0,
          maxCyclomatic: 10,
          scope: 'minor',
          timestamp: '2026-02-26T10:00:00.000Z',
        },
      ],
      alerts: {
        enabled: true,
        thresholds: {
          coverageDropPct: 0,
          complexityRise: 0,
        },
      },
    });

    const dedupedResult = await gateEnforceTool({
      scope: 'minor',
      metrics: {
        coveragePct: 90,
        lintErrors: 0,
        lintWarnings: 0,
        maxCyclomatic: 10,
        testsExist: true,
        testsPassed: true,
        rgrCount: 0,
      },
      history: [
        {
          coveragePct: 90,
          lintWarnings: 0,
          maxCyclomatic: 10,
          scope: 'minor',
          timestamp: '2026-02-26T10:05:00.000Z',
          alertKeys: baselineResult.alerting?.emittedKeys ?? [],
        },
      ],
      alerts: {
        enabled: true,
        thresholds: {
          coverageDropPct: 0,
          complexityRise: 0,
        },
      },
    });

    expect(dedupedResult.alerting?.alerts).toHaveLength(0);
    expect(dedupedResult.alerting?.suppressed).toHaveLength(2);
  });
});
