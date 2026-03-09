import { describe, it, expect } from 'vitest';
import {
  calculateBurnRate,
  averageTokensPerStage,
  forecastBudget,
  generateForecastAlert,
  generateWarningAlert,
  generateExhaustedAlert,
  generateReplenishedAlert,
  evaluateAlerts,
} from '../../src/orchestrator/budget-forecast.js';
import type { BudgetRecord } from '../../src/domain/budget.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const BASE_TIME = '2026-03-09T10:00:00.000Z';

function makeRecord(overrides: Partial<BudgetRecord> = {}): BudgetRecord {
  return {
    id: 'B001',
    scope: 'pipeline',
    scopeId: 'pipe-1',
    limitTokens: 100_000,
    consumedTokens: 0,
    limitUsd: 0,
    consumedUsd: 0,
    status: 'active',
    warningThreshold: 0.8,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    rev: 0,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<{
  totalStages: number;
  completedStages: number;
  pipelineStartedAt: string;
  now: string;
}> = {}) {
  return {
    totalStages: 10,
    completedStages: 5,
    pipelineStartedAt: BASE_TIME,
    now: '2026-03-09T11:00:00.000Z', // 1 hour later
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  calculateBurnRate                                                  */
/* ------------------------------------------------------------------ */

describe('calculateBurnRate', () => {
  it('returns tokens per ms for positive values', () => {
    // 10000 tokens in 1 hour (3600000 ms)
    const rate = calculateBurnRate(10000, BASE_TIME, '2026-03-09T11:00:00.000Z');
    expect(rate).toBeCloseTo(10000 / 3600000, 8);
  });

  it('returns 0 when no tokens consumed', () => {
    expect(calculateBurnRate(0, BASE_TIME, '2026-03-09T11:00:00.000Z')).toBe(0);
  });

  it('returns 0 when elapsed time is zero', () => {
    expect(calculateBurnRate(1000, BASE_TIME, BASE_TIME)).toBe(0);
  });

  it('returns 0 when end is before start', () => {
    expect(calculateBurnRate(1000, '2026-03-09T12:00:00.000Z', BASE_TIME)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  averageTokensPerStage                                              */
/* ------------------------------------------------------------------ */

describe('averageTokensPerStage', () => {
  it('divides consumed tokens by completed stages', () => {
    expect(averageTokensPerStage(50000, 5)).toBe(10000);
  });

  it('returns 0 when no stages completed', () => {
    expect(averageTokensPerStage(1000, 0)).toBe(0);
  });

  it('returns 0 when no tokens consumed', () => {
    expect(averageTokensPerStage(0, 5)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  forecastBudget                                                     */
/* ------------------------------------------------------------------ */

describe('forecastBudget', () => {
  it('forecasts surplus when budget is sufficient', () => {
    const budget = makeRecord({ consumedTokens: 20000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 5, totalStages: 10 });

    const forecast = forecastBudget(budget, ctx);

    expect(forecast.avgTokensPerStage).toBe(4000);
    expect(forecast.estimatedRemainingTokens).toBe(20000); // 5 * 4000
    expect(forecast.remainingBudgetTokens).toBe(80000);
    expect(forecast.projectedSurplusTokens).toBe(60000);
    expect(forecast.willOverspend).toBe(false);
    expect(forecast.recommendedTier).toBeNull();
  });

  it('forecasts overspend when budget is insufficient', () => {
    const budget = makeRecord({ consumedTokens: 80000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 5, totalStages: 10 });

    const forecast = forecastBudget(budget, ctx);

    expect(forecast.avgTokensPerStage).toBe(16000);
    expect(forecast.estimatedRemainingTokens).toBe(80000); // 5 * 16000
    expect(forecast.remainingBudgetTokens).toBe(20000);
    expect(forecast.projectedSurplusTokens).toBe(-60000);
    expect(forecast.willOverspend).toBe(true);
    expect(forecast.recommendedTier).not.toBeNull();
  });

  it('recommends standard tier when it covers the deficit', () => {
    // deficit = 10000, estimated remaining = 50000
    // standard savings = 50000 * (1 - 0.6) = 20000 >= 10000
    const budget = makeRecord({ consumedTokens: 50000, limitTokens: 90000 });
    const ctx = makeCtx({ completedStages: 5, totalStages: 10 });

    const forecast = forecastBudget(budget, ctx);

    expect(forecast.willOverspend).toBe(true);
    expect(forecast.recommendedTier).toBe('standard');
  });

  it('recommends economy tier when standard is insufficient', () => {
    // deficit = 60000, estimated remaining = 80000
    // standard savings = 80000 * 0.4 = 32000 < 60000 → need economy
    const budget = makeRecord({ consumedTokens: 80000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 5, totalStages: 10 });

    const forecast = forecastBudget(budget, ctx);

    expect(forecast.willOverspend).toBe(true);
    expect(forecast.recommendedTier).toBe('economy');
  });

  it('has zero confidence with no completed stages', () => {
    const budget = makeRecord({ consumedTokens: 0, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 0 });

    const forecast = forecastBudget(budget, ctx);

    expect(forecast.confidence).toBe(0);
    expect(forecast.willOverspend).toBe(false);
  });

  it('confidence increases with completed stages', () => {
    const budget = makeRecord({ consumedTokens: 10000, limitTokens: 100000 });

    const c1 = forecastBudget(budget, makeCtx({ completedStages: 1 })).confidence;
    const c3 = forecastBudget(budget, makeCtx({ completedStages: 3 })).confidence;
    const c5 = forecastBudget(budget, makeCtx({ completedStages: 5 })).confidence;

    expect(c1).toBe(0.4);
    expect(c3).toBe(0.7);
    expect(c5).toBe(1.0);
  });

  it('confidence caps at 1.0 for many stages', () => {
    const budget = makeRecord({ consumedTokens: 10000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 8 });

    const forecast = forecastBudget(budget, ctx);

    expect(forecast.confidence).toBe(1.0);
  });

  it('handles single-stage pipeline', () => {
    const budget = makeRecord({ consumedTokens: 5000, limitTokens: 10000 });
    const ctx = makeCtx({ completedStages: 1, totalStages: 2 });

    const forecast = forecastBudget(budget, ctx);

    expect(forecast.avgTokensPerStage).toBe(5000);
    expect(forecast.estimatedRemainingTokens).toBe(5000);
    expect(forecast.willOverspend).toBe(false);
  });

  it('handles nearly complete pipeline with no remaining stages', () => {
    const budget = makeRecord({ consumedTokens: 90000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 10, totalStages: 10 });

    const forecast = forecastBudget(budget, ctx);

    expect(forecast.estimatedRemainingTokens).toBe(0);
    expect(forecast.willOverspend).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  generateForecastAlert                                              */
/* ------------------------------------------------------------------ */

describe('generateForecastAlert', () => {
  it('generates alert for confident overspend forecast', () => {
    const budget = makeRecord({ consumedTokens: 80000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 5 }); // confidence = 1.0

    const alert = generateForecastAlert(budget, ctx);

    expect(alert).not.toBeNull();
    expect(alert!.kind).toBe('BUDGET_FORECAST_OVERSPEND');
    expect(alert!.recommendation).toContain('Downgrade to');
  });

  it('returns null when forecast is positive', () => {
    const budget = makeRecord({ consumedTokens: 10000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 5 });

    const alert = generateForecastAlert(budget, ctx);

    expect(alert).toBeNull();
  });

  it('returns null when confidence is below threshold', () => {
    // 1 completed stage = confidence 0.4 < 0.8
    const budget = makeRecord({ consumedTokens: 80000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 1 });

    const alert = generateForecastAlert(budget, ctx);

    expect(alert).toBeNull();
  });

  it('returns null when no stages completed', () => {
    const budget = makeRecord({ consumedTokens: 80000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 0 });

    const alert = generateForecastAlert(budget, ctx);

    expect(alert).toBeNull();
  });

  it('generates alert at exactly 4 completed stages (confidence = 0.85)', () => {
    const budget = makeRecord({ consumedTokens: 80000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 4, totalStages: 10 });

    const alert = generateForecastAlert(budget, ctx);

    expect(alert).not.toBeNull();
    expect(alert!.forecast!.confidence).toBe(0.85);
  });
});

/* ------------------------------------------------------------------ */
/*  generateWarningAlert                                               */
/* ------------------------------------------------------------------ */

describe('generateWarningAlert', () => {
  it('generates alert when consumption crosses warning threshold', () => {
    const budget = makeRecord({
      consumedTokens: 85000,
      limitTokens: 100000,
      status: 'warning',
    });

    const alert = generateWarningAlert(budget);

    expect(alert).not.toBeNull();
    expect(alert!.kind).toBe('BUDGET_WARNING');
    expect(alert!.message).toContain('85%');
  });

  it('returns null when below warning threshold', () => {
    const budget = makeRecord({ consumedTokens: 10000, limitTokens: 100000 });

    const alert = generateWarningAlert(budget);

    expect(alert).toBeNull();
  });

  it('returns null when already exhausted', () => {
    const budget = makeRecord({
      consumedTokens: 100000,
      limitTokens: 100000,
      status: 'exhausted',
    });

    const alert = generateWarningAlert(budget);

    expect(alert).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  generateExhaustedAlert                                             */
/* ------------------------------------------------------------------ */

describe('generateExhaustedAlert', () => {
  it('generates alert when budget is exhausted', () => {
    const budget = makeRecord({
      consumedTokens: 100000,
      limitTokens: 100000,
      status: 'exhausted',
    });

    const alert = generateExhaustedAlert(budget);

    expect(alert).not.toBeNull();
    expect(alert!.kind).toBe('BUDGET_EXHAUSTED');
    expect(alert!.recommendation).toContain('/budget replenish');
  });

  it('returns null when budget is not exhausted', () => {
    const budget = makeRecord({ status: 'active' });

    const alert = generateExhaustedAlert(budget);

    expect(alert).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  generateReplenishedAlert                                           */
/* ------------------------------------------------------------------ */

describe('generateReplenishedAlert', () => {
  it('generates alert with added tokens', () => {
    const budget = makeRecord({ limitTokens: 150000 });

    const alert = generateReplenishedAlert(budget, 50000);

    expect(alert.kind).toBe('BUDGET_REPLENISHED');
    expect(alert.message).toContain('50,000');
    expect(alert.message).toContain('150,000');
  });
});

/* ------------------------------------------------------------------ */
/*  evaluateAlerts                                                     */
/* ------------------------------------------------------------------ */

describe('evaluateAlerts', () => {
  it('returns exhausted alert and no others when exhausted', () => {
    const budget = makeRecord({
      consumedTokens: 100000,
      limitTokens: 100000,
      status: 'exhausted',
    });
    const ctx = makeCtx({ completedStages: 5 });

    const alerts = evaluateAlerts(budget, ctx);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe('BUDGET_EXHAUSTED');
  });

  it('returns forecast alert when overspend predicted', () => {
    const budget = makeRecord({ consumedTokens: 80000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 5 });

    const alerts = evaluateAlerts(budget, ctx);

    expect(alerts.some((a) => a.kind === 'BUDGET_FORECAST_OVERSPEND')).toBe(true);
  });

  it('does not double-alert warning when forecast is present', () => {
    const budget = makeRecord({
      consumedTokens: 85000,
      limitTokens: 100000,
      status: 'warning',
    });
    const ctx = makeCtx({ completedStages: 5 });

    const alerts = evaluateAlerts(budget, ctx);

    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toContain('BUDGET_FORECAST_OVERSPEND');
    expect(kinds).not.toContain('BUDGET_WARNING');
  });

  it('returns warning alert when no forecast overspend', () => {
    // At warning threshold but forecast is positive
    const budget = makeRecord({
      consumedTokens: 82000,
      limitTokens: 100000,
      status: 'warning',
    });
    // Lots of budget left relative to remaining stages
    const ctx = makeCtx({ completedStages: 9, totalStages: 10 });

    const alerts = evaluateAlerts(budget, ctx);

    // avg = 82000/9 ≈ 9111, remaining = 1 stage, est = 9111, budget = 18000 → no overspend
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toContain('BUDGET_WARNING');
    expect(kinds).not.toContain('BUDGET_FORECAST_OVERSPEND');
  });

  it('returns empty for healthy budget', () => {
    const budget = makeRecord({ consumedTokens: 10000, limitTokens: 100000 });
    const ctx = makeCtx({ completedStages: 5 });

    const alerts = evaluateAlerts(budget, ctx);

    expect(alerts).toHaveLength(0);
  });
});
