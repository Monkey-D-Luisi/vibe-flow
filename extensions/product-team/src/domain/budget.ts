/**
 * Budget domain model for hard budget limits enforcement.
 *
 * Implements a hierarchical budget system: global → pipeline → stage → agent.
 * Each scope has token and USD limits with automatic status transitions
 * (active → warning → exhausted) based on consumption thresholds.
 */

export const BudgetScope = {
  Global: 'global',
  Pipeline: 'pipeline',
  Stage: 'stage',
  Agent: 'agent',
} as const;

export type BudgetScope = (typeof BudgetScope)[keyof typeof BudgetScope];

export const ALL_BUDGET_SCOPES: readonly BudgetScope[] = [
  BudgetScope.Global,
  BudgetScope.Pipeline,
  BudgetScope.Stage,
  BudgetScope.Agent,
];

export const BudgetStatus = {
  Active: 'active',
  Warning: 'warning',
  Exhausted: 'exhausted',
} as const;

export type BudgetStatus = (typeof BudgetStatus)[keyof typeof BudgetStatus];

export const ALL_BUDGET_STATUSES: readonly BudgetStatus[] = [
  BudgetStatus.Active,
  BudgetStatus.Warning,
  BudgetStatus.Exhausted,
];

export interface BudgetRecord {
  readonly id: string;
  scope: BudgetScope;
  scopeId: string;
  limitTokens: number;
  consumedTokens: number;
  limitUsd: number;
  consumedUsd: number;
  status: BudgetStatus;
  warningThreshold: number;
  readonly createdAt: string;
  updatedAt: string;
  rev: number;
}

export interface CreateBudgetInput {
  scope: BudgetScope;
  scopeId: string;
  limitTokens: number;
  limitUsd?: number;
  warningThreshold?: number;
}

const DEFAULT_WARNING_THRESHOLD = 0.8;

/**
 * Create a new BudgetRecord with default values.
 * Status starts as 'active', consumption at zero.
 */
export function createBudgetRecord(
  input: CreateBudgetInput,
  id: string,
  now: string,
): BudgetRecord {
  return {
    id,
    scope: input.scope,
    scopeId: input.scopeId,
    limitTokens: input.limitTokens,
    consumedTokens: 0,
    limitUsd: input.limitUsd ?? 0,
    consumedUsd: 0,
    status: BudgetStatus.Active,
    warningThreshold: input.warningThreshold ?? DEFAULT_WARNING_THRESHOLD,
    createdAt: now,
    updatedAt: now,
    rev: 0,
  };
}

export interface BudgetConsumption {
  readonly tokens: number;
  readonly usd: number;
}

export interface BudgetStatusTransition {
  readonly from: BudgetStatus;
  readonly to: BudgetStatus;
  readonly budgetId: string;
  readonly scope: BudgetScope;
  readonly scopeId: string;
  readonly consumedTokens: number;
  readonly limitTokens: number;
  readonly consumedUsd: number;
  readonly limitUsd: number;
}

/**
 * Compute the new status for a budget after consumption is applied.
 * Returns the new status and whether a transition occurred.
 */
export function computeBudgetStatus(
  record: BudgetRecord,
  consumption: BudgetConsumption,
): { status: BudgetStatus; transition: BudgetStatusTransition | null } {
  const newConsumedTokens = record.consumedTokens + consumption.tokens;
  const newConsumedUsd = record.consumedUsd + consumption.usd;

  const tokenRatio =
    record.limitTokens > 0 ? newConsumedTokens / record.limitTokens : 0;
  const usdRatio = record.limitUsd > 0 ? newConsumedUsd / record.limitUsd : 0;
  const maxRatio = Math.max(tokenRatio, usdRatio);

  let newStatus: BudgetStatus;
  if (maxRatio >= 1.0) {
    newStatus = BudgetStatus.Exhausted;
  } else if (maxRatio >= record.warningThreshold) {
    newStatus = BudgetStatus.Warning;
  } else {
    newStatus = BudgetStatus.Active;
  }

  const transition: BudgetStatusTransition | null =
    newStatus !== record.status
      ? {
          from: record.status,
          to: newStatus,
          budgetId: record.id,
          scope: record.scope,
          scopeId: record.scopeId,
          consumedTokens: newConsumedTokens,
          limitTokens: record.limitTokens,
          consumedUsd: newConsumedUsd,
          limitUsd: record.limitUsd,
        }
      : null;

  return { status: newStatus, transition };
}

/**
 * Check whether a budget record allows further LLM consumption.
 */
export function isBudgetExhausted(record: BudgetRecord): boolean {
  return record.status === BudgetStatus.Exhausted;
}

/**
 * Calculate remaining tokens for a budget record.
 */
export function remainingTokens(record: BudgetRecord): number {
  return Math.max(0, record.limitTokens - record.consumedTokens);
}

/**
 * Calculate remaining USD for a budget record.
 */
export function remainingUsd(record: BudgetRecord): number {
  return Math.max(0, record.limitUsd - record.consumedUsd);
}

/**
 * Calculate consumption ratio (0.0 to 1.0+).
 */
export function consumptionRatio(record: BudgetRecord): number {
  const tokenRatio =
    record.limitTokens > 0 ? record.consumedTokens / record.limitTokens : 0;
  const usdRatio =
    record.limitUsd > 0 ? record.consumedUsd / record.limitUsd : 0;
  return Math.max(tokenRatio, usdRatio);
}
