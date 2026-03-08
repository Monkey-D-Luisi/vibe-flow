/**
 * Cost-Aware Model Tier Router
 *
 * Selects the appropriate model tier based on remaining budget fraction,
 * task complexity, and configurable tier thresholds. Replaces the
 * single-threshold placeholder from Task 0081.
 *
 * EP10 Task 0082
 */

import type { ModelTier } from './model-resolver.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Configuration for cost-aware tier thresholds. */
export interface CostAwareTierConfig {
  /**
   * Budget fraction above which premium tier is allowed.
   * Default: 0.5 (50% remaining).
   */
  premiumThreshold: number;
  /**
   * Budget fraction above which standard tier is allowed (but below premium).
   * Default: 0.2 (20% remaining).
   */
  standardThreshold: number;
  /**
   * Complexity score above which high-complexity override applies.
   * High-complexity tasks resist downgrade by one tier.
   * Default: 70.
   */
  highComplexityFloor: number;
}

/** Input for cost-aware tier selection. */
export interface CostAwareTierInput {
  /** The desired model tier from complexity-based routing. */
  desiredTier: ModelTier;
  /** Budget remaining as a fraction [0, 1]. undefined = no budget tracking. */
  budgetRemainingFraction: number | undefined;
  /** Complexity score (0-100) from the complexity scorer. */
  complexityScore: number;
}

/** Result of cost-aware tier selection. */
export interface CostAwareTierResult {
  /** The final tier after cost-aware adjustment. */
  tier: ModelTier;
  /** Whether the tier was downgraded from the desired tier. */
  downgraded: boolean;
  /** The tier allowed by the budget (before high-complexity override). */
  budgetAllowedTier: ModelTier;
  /** Whether high-complexity override was applied. */
  highComplexityOverride: boolean;
  /** Snapshot of the budget fraction at decision time. */
  budgetSnapshot: number | undefined;
  /** Human-readable reason for the decision. */
  reason: string;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

/** Default cost-aware tier config. */
export const DEFAULT_COST_AWARE_CONFIG: Readonly<CostAwareTierConfig> = {
  premiumThreshold: 0.5,
  standardThreshold: 0.2,
  highComplexityFloor: 70,
};

/** Ordered tier precedence (premium > standard > economy). */
const TIER_ORDER: readonly ModelTier[] = ['premium', 'standard', 'economy'];

/* ------------------------------------------------------------------ */
/*  Core logic                                                         */
/* ------------------------------------------------------------------ */

/**
 * Upgrade one tier step (economy → standard, standard → premium, premium stays).
 */
function upgradeTier(tier: ModelTier): ModelTier {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx <= 0) return 'premium';
  return TIER_ORDER[idx - 1];
}

/**
 * Compare tiers: returns negative if a < b, 0 if equal, positive if a > b.
 * Premium is highest (index 0), economy is lowest (index 2).
 */
function compareTiers(a: ModelTier, b: ModelTier): number {
  return TIER_ORDER.indexOf(b) - TIER_ORDER.indexOf(a);
}

/**
 * Determine the maximum tier allowed by the current budget.
 */
function budgetAllowedTier(fraction: number, config: CostAwareTierConfig): ModelTier {
  if (fraction >= config.premiumThreshold) return 'premium';
  if (fraction >= config.standardThreshold) return 'standard';
  return 'economy';
}

/**
 * Apply cost-aware tier selection.
 *
 * Pure function — no side effects, no DB/network calls. The budget fraction
 * is injected by the caller.
 *
 * Algorithm:
 * 1. If no budget fraction, return desired tier unchanged.
 * 2. Determine maximum tier allowed by budget thresholds.
 * 3. If desired tier is within budget, use it as-is.
 * 4. Otherwise, downgrade to budget-allowed tier.
 * 5. If complexity score exceeds highComplexityFloor, upgrade one tier
 *    (but never above the original desired tier).
 */
export function applyCostAwareTier(
  input: CostAwareTierInput,
  config: CostAwareTierConfig = DEFAULT_COST_AWARE_CONFIG,
): CostAwareTierResult {
  const { desiredTier, budgetRemainingFraction, complexityScore } = input;

  // No budget tracking — pass through
  if (budgetRemainingFraction === undefined) {
    return {
      tier: desiredTier,
      downgraded: false,
      budgetAllowedTier: desiredTier,
      highComplexityOverride: false,
      budgetSnapshot: undefined,
      reason: 'no budget tracking active',
    };
  }

  // Clamp fraction to [0, 1]
  const fraction = Math.max(0, Math.min(1, budgetRemainingFraction));

  const allowed = budgetAllowedTier(fraction, config);

  // Check if desired tier exceeds budget-allowed tier
  if (compareTiers(desiredTier, allowed) <= 0) {
    // Desired tier is within or below budget — no downgrade needed
    return {
      tier: desiredTier,
      downgraded: false,
      budgetAllowedTier: allowed,
      highComplexityOverride: false,
      budgetSnapshot: fraction,
      reason: `budget ${(fraction * 100).toFixed(0)}% allows ${allowed} tier`,
    };
  }

  // Downgrade to budget-allowed tier
  let finalTier = allowed;
  let highComplexityOverride = false;

  // High-complexity override: upgrade one tier (but cap at desired tier)
  if (complexityScore > config.highComplexityFloor) {
    const upgraded = upgradeTier(allowed);
    // Only apply if upgraded tier is still at or below the desired tier
    if (compareTiers(upgraded, desiredTier) <= 0) {
      finalTier = upgraded;
      highComplexityOverride = true;
    }
  }

  const downgraded = finalTier !== desiredTier;

  const overrideNote = highComplexityOverride
    ? ` (high-complexity override: score ${complexityScore} > ${config.highComplexityFloor})`
    : '';

  return {
    tier: finalTier,
    downgraded,
    budgetAllowedTier: allowed,
    highComplexityOverride,
    budgetSnapshot: fraction,
    reason: `budget ${(fraction * 100).toFixed(0)}% → ${allowed} tier, final ${finalTier}${overrideNote}`,
  };
}
