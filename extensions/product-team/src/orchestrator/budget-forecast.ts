/**
 * Budget forecasting engine.
 *
 * Calculates burn rate from consumption history and estimates whether the
 * remaining budget will cover the remaining pipeline stages. Produces
 * actionable forecasts with model tier downgrade recommendations.
 *
 * EP11 Task 0088
 */

import type { BudgetRecord } from '../domain/budget.js';
import { consumptionRatio } from '../domain/budget.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PipelineContext {
  /** Total number of pipeline stages (e.g. 10 for IDEA→DONE). */
  readonly totalStages: number;
  /** Number of stages already completed. */
  readonly completedStages: number;
  /** ISO timestamp when the pipeline started. */
  readonly pipelineStartedAt: string;
  /** Current ISO timestamp. */
  readonly now: string;
}

export type ForecastAlertKind =
  | 'BUDGET_WARNING'
  | 'BUDGET_FORECAST_OVERSPEND'
  | 'BUDGET_EXHAUSTED'
  | 'BUDGET_REPLENISHED';

export interface BudgetForecast {
  /** Current burn rate in tokens per millisecond. */
  readonly burnRateTokensPerMs: number;
  /** Average tokens consumed per completed stage. */
  readonly avgTokensPerStage: number;
  /** Estimated tokens needed for remaining stages. */
  readonly estimatedRemainingTokens: number;
  /** Tokens still available. */
  readonly remainingBudgetTokens: number;
  /** Projected surplus (positive) or deficit (negative). */
  readonly projectedSurplusTokens: number;
  /** Whether the forecast predicts overspend. */
  readonly willOverspend: boolean;
  /** Confidence level (0.0 to 1.0). */
  readonly confidence: number;
  /** Recommended model tier if downgrade would help, null otherwise. */
  readonly recommendedTier: 'standard' | 'economy' | null;
  /** Estimated savings if downgrading to the recommended tier. */
  readonly estimatedSavingsTokens: number;
}

export interface BudgetAlert {
  readonly kind: ForecastAlertKind;
  readonly scope: string;
  readonly scopeId: string;
  readonly message: string;
  readonly recommendation: string | null;
  readonly forecast: BudgetForecast | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Minimum confidence to emit a forecast overspend alert. */
const MIN_FORECAST_CONFIDENCE = 0.8;

/** Minimum completed stages to produce a meaningful forecast. */
const MIN_STAGES_FOR_FORECAST = 1;

/**
 * Approximate token savings multipliers for tier downgrades.
 * Standard tier uses ~60% of premium tokens (cheaper models are more concise).
 * Economy tier uses ~30% of premium tokens.
 */
const TIER_SAVINGS_MULTIPLIER: Readonly<Record<string, number>> = {
  standard: 0.6,
  economy: 0.3,
};

/* ------------------------------------------------------------------ */
/*  Core forecasting                                                   */
/* ------------------------------------------------------------------ */

/**
 * Calculate burn rate in tokens per millisecond.
 * Returns 0 if elapsed time is zero or negative.
 */
export function calculateBurnRate(
  consumedTokens: number,
  startedAt: string,
  now: string,
): number {
  const elapsedMs = new Date(now).getTime() - new Date(startedAt).getTime();
  if (elapsedMs <= 0 || consumedTokens <= 0) return 0;
  return consumedTokens / elapsedMs;
}

/**
 * Calculate the average tokens consumed per completed stage.
 * Returns 0 if no stages have been completed.
 */
export function averageTokensPerStage(
  consumedTokens: number,
  completedStages: number,
): number {
  if (completedStages <= 0 || consumedTokens <= 0) return 0;
  return consumedTokens / completedStages;
}

/**
 * Produce a full budget forecast for a pipeline budget record.
 *
 * The confidence score reflects how reliable the forecast is:
 * - Increases with the number of completed stages (more data = better estimate)
 * - Caps at 1.0 when >= 5 stages are done (half the typical pipeline)
 */
export function forecastBudget(
  budget: BudgetRecord,
  ctx: PipelineContext,
): BudgetForecast {
  const remainingStages = ctx.totalStages - ctx.completedStages;
  const remaining = Math.max(0, budget.limitTokens - budget.consumedTokens);

  const burnRate = calculateBurnRate(
    budget.consumedTokens,
    ctx.pipelineStartedAt,
    ctx.now,
  );

  const avgPerStage = averageTokensPerStage(
    budget.consumedTokens,
    ctx.completedStages,
  );

  const estimatedRemaining = avgPerStage * remainingStages;
  const surplus = remaining - estimatedRemaining;
  const willOverspend = surplus < 0;

  // Confidence: scales linearly from 0.4 at 1 stage to 1.0 at 5+ stages
  const confidence =
    ctx.completedStages >= MIN_STAGES_FOR_FORECAST
      ? Math.min(1.0, 0.4 + (ctx.completedStages - 1) * 0.15)
      : 0;

  // Determine recommended tier and savings
  let recommendedTier: 'standard' | 'economy' | null = null;
  let estimatedSavings = 0;

  if (willOverspend && ctx.completedStages >= MIN_STAGES_FOR_FORECAST) {
    const deficit = Math.abs(surplus);
    // Check if downgrading to standard tier would fix the deficit
    const standardSavings = estimatedRemaining * (1 - TIER_SAVINGS_MULTIPLIER.standard!);
    if (standardSavings >= deficit) {
      recommendedTier = 'standard';
      estimatedSavings = Math.round(standardSavings);
    } else {
      // Need economy tier
      const economySavings = estimatedRemaining * (1 - TIER_SAVINGS_MULTIPLIER.economy!);
      recommendedTier = 'economy';
      estimatedSavings = Math.round(economySavings);
    }
  }

  return {
    burnRateTokensPerMs: burnRate,
    avgTokensPerStage: Math.round(avgPerStage),
    estimatedRemainingTokens: Math.round(estimatedRemaining),
    remainingBudgetTokens: remaining,
    projectedSurplusTokens: Math.round(surplus),
    willOverspend,
    confidence,
    recommendedTier,
    estimatedSavingsTokens: estimatedSavings,
  };
}

/* ------------------------------------------------------------------ */
/*  Alert generation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Generate a forecast overspend alert if the forecast is confident enough.
 * Returns null if no alert should be generated.
 */
export function generateForecastAlert(
  budget: BudgetRecord,
  ctx: PipelineContext,
): BudgetAlert | null {
  if (ctx.completedStages < MIN_STAGES_FOR_FORECAST) return null;

  const forecast = forecastBudget(budget, ctx);

  if (!forecast.willOverspend) return null;
  if (forecast.confidence < MIN_FORECAST_CONFIDENCE) return null;

  const deficitTokens = Math.abs(forecast.projectedSurplusTokens);
  const recommendation = forecast.recommendedTier
    ? `Downgrade to ${forecast.recommendedTier} tier to save ~${forecast.estimatedSavingsTokens.toLocaleString('en-US')} tokens`
    : null;

  return {
    kind: 'BUDGET_FORECAST_OVERSPEND',
    scope: budget.scope,
    scopeId: budget.scopeId,
    message: `Budget projected to overspend by ${deficitTokens.toLocaleString('en-US')} tokens (${Math.round(forecast.confidence * 100)}% confidence). ${ctx.totalStages - ctx.completedStages} stages remaining at ~${forecast.avgTokensPerStage.toLocaleString('en-US')} tokens/stage.`,
    recommendation,
    forecast,
  };
}

/**
 * Generate a budget warning alert when consumption crosses the warning threshold.
 */
export function generateWarningAlert(
  budget: BudgetRecord,
): BudgetAlert | null {
  const ratio = consumptionRatio(budget);
  if (ratio < budget.warningThreshold) return null;
  if (budget.status === 'exhausted') return null;

  return {
    kind: 'BUDGET_WARNING',
    scope: budget.scope,
    scopeId: budget.scopeId,
    message: `Budget at ${Math.round(ratio * 100)}% consumption (${budget.consumedTokens.toLocaleString('en-US')} / ${budget.limitTokens.toLocaleString('en-US')} tokens).`,
    recommendation: 'Consider downgrading model tier or replenishing budget.',
    forecast: null,
  };
}

/**
 * Generate a budget exhausted alert.
 */
export function generateExhaustedAlert(
  budget: BudgetRecord,
): BudgetAlert | null {
  if (budget.status !== 'exhausted') return null;

  return {
    kind: 'BUDGET_EXHAUSTED',
    scope: budget.scope,
    scopeId: budget.scopeId,
    message: `Budget exhausted. ${budget.consumedTokens.toLocaleString('en-US')} tokens consumed against ${budget.limitTokens.toLocaleString('en-US')} limit. Pipeline paused.`,
    recommendation: 'Use `/budget replenish` to add tokens, or downgrade model tier.',
    forecast: null,
  };
}

/**
 * Generate a budget replenished alert.
 */
export function generateReplenishedAlert(
  budget: BudgetRecord,
  addedTokens: number,
): BudgetAlert {
  return {
    kind: 'BUDGET_REPLENISHED',
    scope: budget.scope,
    scopeId: budget.scopeId,
    message: `Budget replenished with ${addedTokens.toLocaleString('en-US')} tokens. New limit: ${budget.limitTokens.toLocaleString('en-US')} tokens.`,
    recommendation: null,
    forecast: null,
  };
}

/**
 * Evaluate all applicable alerts for a budget after a stage completion.
 * Returns alerts in priority order (highest priority first).
 */
export function evaluateAlerts(
  budget: BudgetRecord,
  ctx: PipelineContext,
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];

  const exhausted = generateExhaustedAlert(budget);
  if (exhausted) {
    alerts.push(exhausted);
    return alerts; // No point forecasting if already exhausted
  }

  const forecast = generateForecastAlert(budget, ctx);
  if (forecast) alerts.push(forecast);

  const warning = generateWarningAlert(budget);
  if (warning && !forecast) alerts.push(warning); // Don't double-alert

  return alerts;
}
