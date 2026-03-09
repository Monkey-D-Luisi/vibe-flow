import { describe, it, expect } from 'vitest';
import {
  formatBudgetAlert,
  alertPriority,
  type BudgetAlert,
} from '../src/budget-alerts.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeAlert(overrides: Partial<BudgetAlert> = {}): BudgetAlert {
  return {
    kind: 'BUDGET_WARNING',
    scope: 'pipeline',
    scopeId: 'pipe-1',
    message: 'Budget at 85% consumption.',
    recommendation: 'Consider downgrading model tier.',
    forecast: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  formatBudgetAlert                                                  */
/* ------------------------------------------------------------------ */

describe('formatBudgetAlert', () => {
  it('formats a warning alert', () => {
    const alert = makeAlert();
    const result = formatBudgetAlert(alert);

    expect(result).toContain('Budget Warning');
    expect(result).toContain('pipeline/pipe\\-1');
    expect(result).toContain('85%');
  });

  it('formats an exhausted alert', () => {
    const alert = makeAlert({
      kind: 'BUDGET_EXHAUSTED',
      message: 'Budget exhausted. 100,000 tokens consumed against 100,000 limit.',
      recommendation: 'Use `/budget replenish` to add tokens.',
    });
    const result = formatBudgetAlert(alert);

    expect(result).toContain('Budget Exhausted');
    expect(result).toContain('\u274C');
  });

  it('formats a replenished alert', () => {
    const alert = makeAlert({
      kind: 'BUDGET_REPLENISHED',
      message: 'Budget replenished with 50,000 tokens.',
      recommendation: null,
    });
    const result = formatBudgetAlert(alert);

    expect(result).toContain('Budget Replenished');
    expect(result).toContain('\u2705');
    // No recommendation line
    expect(result).not.toContain('\uD83D\uDCA1');
  });

  it('includes forecast details for overspend alerts', () => {
    const alert = makeAlert({
      kind: 'BUDGET_FORECAST_OVERSPEND',
      message: 'Projected overspend by 60,000 tokens.',
      recommendation: 'Downgrade to economy tier.',
      forecast: {
        avgTokensPerStage: 16000,
        estimatedRemainingTokens: 80000,
        remainingBudgetTokens: 20000,
        projectedSurplusTokens: -60000,
        confidence: 1.0,
        recommendedTier: 'economy',
        estimatedSavingsTokens: 56000,
      },
    });
    const result = formatBudgetAlert(alert);

    expect(result).toContain('Overspend Forecast');
    expect(result).toContain('Forecast details');
    expect(result).toContain('Remaining budget');
    expect(result).toContain('Estimated need');
    expect(result).toContain('Projected deficit');
  });

  it('does not include forecast details for non-overspend alerts', () => {
    const alert = makeAlert({ kind: 'BUDGET_WARNING' });
    const result = formatBudgetAlert(alert);

    expect(result).not.toContain('Forecast details');
  });

  it('escapes special MarkdownV2 characters in scope', () => {
    const alert = makeAlert({ scopeId: 'pipe-1::back-1' });
    const result = formatBudgetAlert(alert);

    expect(result).toContain('pipe\\-1::back\\-1');
  });
});

/* ------------------------------------------------------------------ */
/*  alertPriority                                                      */
/* ------------------------------------------------------------------ */

describe('alertPriority', () => {
  it('returns high for BUDGET_EXHAUSTED', () => {
    expect(alertPriority('BUDGET_EXHAUSTED')).toBe('high');
  });

  it('returns high for BUDGET_FORECAST_OVERSPEND', () => {
    expect(alertPriority('BUDGET_FORECAST_OVERSPEND')).toBe('high');
  });

  it('returns normal for BUDGET_WARNING', () => {
    expect(alertPriority('BUDGET_WARNING')).toBe('normal');
  });

  it('returns normal for BUDGET_REPLENISHED', () => {
    expect(alertPriority('BUDGET_REPLENISHED')).toBe('normal');
  });
});
