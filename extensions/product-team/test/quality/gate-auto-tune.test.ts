import { describe, expect, it } from 'vitest';
import { autoTunePolicy } from '../../src/quality/gate-auto-tune.js';
import { DEFAULT_POLICIES } from '../../src/quality/types.js';

describe('gate auto tune policy', () => {
  it('applies bounded adjustments using historical medians', () => {
    const history = [
      { coveragePct: 90, lintWarnings: 5, maxCyclomatic: 12 },
      { coveragePct: 92, lintWarnings: 4, maxCyclomatic: 14 },
      { coveragePct: 94, lintWarnings: 6, maxCyclomatic: 11 },
      { coveragePct: 88, lintWarnings: 5, maxCyclomatic: 10 },
      { coveragePct: 91, lintWarnings: 3, maxCyclomatic: 13 },
    ];

    const tuned = autoTunePolicy(DEFAULT_POLICIES.minor, history, {
      minSamples: 5,
      smoothingFactor: 0.5,
      maxDeltas: {
        coverageMinPct: 4,
        lintMaxWarnings: 6,
        complexityMaxCyclomatic: 4,
      },
    });

    expect(tuned.applied).toBe(true);
    expect(tuned.sampleCount).toBe(5);
    expect(tuned.tunedPolicy.coverageMinPct).toBe(74);
    expect(tuned.tunedPolicy.lintMaxWarnings).toBe(14);
    expect(tuned.tunedPolicy.complexityMaxCyclomatic).toBe(16);
    expect(tuned.adjustments).toHaveLength(3);
  });

  it('returns unchanged policy when history is insufficient', () => {
    const history = [
      { coveragePct: 80, lintWarnings: 8, maxCyclomatic: 16 },
      { coveragePct: 82, lintWarnings: 7, maxCyclomatic: 15 },
      { coveragePct: 81, lintWarnings: 9, maxCyclomatic: 18 },
    ];

    const tuned = autoTunePolicy(DEFAULT_POLICIES.minor, history, {
      minSamples: 5,
    });

    expect(tuned.applied).toBe(false);
    expect(tuned.tunedPolicy).toEqual(DEFAULT_POLICIES.minor);
    expect(tuned.reason).toContain('Insufficient history samples');
  });

  it('clamps adjusted thresholds to configured bounds', () => {
    const history = Array.from({ length: 6 }, () => ({
      coveragePct: 120,
      lintWarnings: 60,
      maxCyclomatic: 1,
    }));

    const tuned = autoTunePolicy(DEFAULT_POLICIES.minor, history, {
      minSamples: 5,
      smoothingFactor: 1,
      maxDeltas: {
        coverageMinPct: 20,
        lintMaxWarnings: 50,
        complexityMaxCyclomatic: 50,
      },
      bounds: {
        coverageMinPct: { min: 65, max: 75 },
        lintMaxWarnings: { min: 0, max: 25 },
        complexityMaxCyclomatic: { min: 15, max: 30 },
      },
    });

    expect(tuned.applied).toBe(true);
    expect(tuned.tunedPolicy.coverageMinPct).toBe(75);
    expect(tuned.tunedPolicy.lintMaxWarnings).toBe(25);
    expect(tuned.tunedPolicy.complexityMaxCyclomatic).toBe(15);
  });
});

