import { describe, expect, it } from 'vitest';
import { evaluateRegressionAlerts } from '../../src/quality/gate-alerts.js';

describe('gate regression alerts', () => {
  it('triggers coverage-drop and complexity-rise alerts with traceable metadata', () => {
    const result = evaluateRegressionAlerts(
      {
        coveragePct: 82,
        maxCyclomatic: 14,
      },
      [
        {
          coveragePct: 95,
          maxCyclomatic: 8,
          scope: 'minor',
          timestamp: '2026-02-26T10:00:00.000Z',
        },
      ],
      'minor',
      {
        thresholds: {
          coverageDropPct: 5,
          complexityRise: 3,
        },
      },
      '2026-02-26T10:05:00.000Z',
    );

    expect(result.alerts).toHaveLength(2);
    expect(result.alerts[0]).toHaveProperty('key');
    expect(result.alerts.some((alert) => alert.metric === 'coverageDropPct')).toBe(true);
    expect(result.alerts.some((alert) => alert.metric === 'complexityRise')).toBe(true);
    expect(result.suppressed).toHaveLength(0);
    expect(result.emittedKeys).toHaveLength(2);
  });

  it('suppresses repeated identical alert keys within cooldown history', () => {
    const initial = evaluateRegressionAlerts(
      {
        coveragePct: 90,
        maxCyclomatic: 10,
      },
      [
        {
          coveragePct: 90,
          maxCyclomatic: 10,
          scope: 'minor',
          timestamp: '2026-02-26T10:00:00.000Z',
        },
      ],
      'minor',
      {
        thresholds: {
          coverageDropPct: 0,
          complexityRise: 0,
        },
      },
      '2026-02-26T10:05:00.000Z',
    );

    const deduped = evaluateRegressionAlerts(
      {
        coveragePct: 90,
        maxCyclomatic: 10,
      },
      [
        {
          coveragePct: 90,
          maxCyclomatic: 10,
          scope: 'minor',
          timestamp: '2026-02-26T10:10:00.000Z',
          alertKeys: initial.emittedKeys,
        },
      ],
      'minor',
      {
        thresholds: {
          coverageDropPct: 0,
          complexityRise: 0,
        },
      },
      '2026-02-26T10:11:00.000Z',
    );

    expect(deduped.alerts).toHaveLength(0);
    expect(deduped.suppressed).toHaveLength(2);
  });
});
