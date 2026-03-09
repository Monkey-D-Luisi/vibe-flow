/**
 * Telegram budget alert formatting.
 *
 * Converts BudgetAlert objects from the forecasting engine into
 * MarkdownV2-formatted Telegram messages ready for the message queue.
 *
 * EP11 Task 0088
 */

import { escapeMarkdownV2 } from './formatting.js';

/* ------------------------------------------------------------------ */
/*  Types (mirrored from product-team to avoid cross-extension import) */
/* ------------------------------------------------------------------ */

export type ForecastAlertKind =
  | 'BUDGET_WARNING'
  | 'BUDGET_FORECAST_OVERSPEND'
  | 'BUDGET_EXHAUSTED'
  | 'BUDGET_REPLENISHED';

export interface BudgetAlert {
  readonly kind: ForecastAlertKind;
  readonly scope: string;
  readonly scopeId: string;
  readonly message: string;
  readonly recommendation: string | null;
  readonly forecast: {
    readonly avgTokensPerStage: number;
    readonly estimatedRemainingTokens: number;
    readonly remainingBudgetTokens: number;
    readonly projectedSurplusTokens: number;
    readonly confidence: number;
    readonly recommendedTier: string | null;
    readonly estimatedSavingsTokens: number;
  } | null;
}

/* ------------------------------------------------------------------ */
/*  Alert emoji mapping                                                */
/* ------------------------------------------------------------------ */

const ALERT_EMOJI: Readonly<Record<ForecastAlertKind, string>> = {
  BUDGET_WARNING: '\u26A0\uFE0F',
  BUDGET_FORECAST_OVERSPEND: '\uD83D\uDCC9',
  BUDGET_EXHAUSTED: '\u274C',
  BUDGET_REPLENISHED: '\u2705',
};

const ALERT_TITLE: Readonly<Record<ForecastAlertKind, string>> = {
  BUDGET_WARNING: 'Budget Warning',
  BUDGET_FORECAST_OVERSPEND: 'Overspend Forecast',
  BUDGET_EXHAUSTED: 'Budget Exhausted',
  BUDGET_REPLENISHED: 'Budget Replenished',
};

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

/**
 * Format a BudgetAlert into a MarkdownV2 Telegram message.
 */
export function formatBudgetAlert(alert: BudgetAlert): string {
  const emoji = ALERT_EMOJI[alert.kind];
  const title = ALERT_TITLE[alert.kind];
  const scope = escapeMarkdownV2(`${alert.scope}/${alert.scopeId}`);

  const lines: string[] = [];
  lines.push(`${emoji} *${escapeMarkdownV2(title)}* \\[${scope}\\]`);
  lines.push('');
  lines.push(escapeMarkdownV2(alert.message));

  if (alert.recommendation) {
    lines.push('');
    lines.push(`\uD83D\uDCA1 ${escapeMarkdownV2(alert.recommendation)}`);
  }

  if (alert.forecast && alert.kind === 'BUDGET_FORECAST_OVERSPEND') {
    lines.push('');
    lines.push(formatForecastDetails(alert.forecast));
  }

  return lines.join('\n');
}

function formatForecastDetails(forecast: {
  readonly avgTokensPerStage: number;
  readonly estimatedRemainingTokens: number;
  readonly remainingBudgetTokens: number;
  readonly projectedSurplusTokens: number;
  readonly confidence: number;
}): string {
  const remaining = forecast.remainingBudgetTokens.toLocaleString('en-US');
  const estimated = forecast.estimatedRemainingTokens.toLocaleString('en-US');
  const deficit = Math.abs(forecast.projectedSurplusTokens).toLocaleString('en-US');
  const conf = `${Math.round(forecast.confidence * 100)}%`;

  return [
    `_Forecast details:_`,
    `  Remaining budget: ${escapeMarkdownV2(remaining)} tokens`,
    `  Estimated need: ${escapeMarkdownV2(estimated)} tokens`,
    `  Projected deficit: ${escapeMarkdownV2(deficit)} tokens`,
    `  Confidence: ${escapeMarkdownV2(conf)}`,
  ].join('\n');
}

/**
 * Determine the priority for a budget alert in the Telegram message queue.
 */
export function alertPriority(kind: ForecastAlertKind): 'high' | 'normal' | 'low' {
  switch (kind) {
    case 'BUDGET_EXHAUSTED':
      return 'high';
    case 'BUDGET_FORECAST_OVERSPEND':
      return 'high';
    case 'BUDGET_WARNING':
      return 'normal';
    case 'BUDGET_REPLENISHED':
      return 'normal';
  }
}
