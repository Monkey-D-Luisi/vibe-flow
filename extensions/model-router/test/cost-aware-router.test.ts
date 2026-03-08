import { describe, it, expect } from 'vitest';
import {
  applyCostAwareTier,
  DEFAULT_COST_AWARE_CONFIG,
  type CostAwareTierConfig,
  type CostAwareTierInput,
} from '../src/cost-aware-router.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeInput(overrides?: Partial<CostAwareTierInput>): CostAwareTierInput {
  return {
    desiredTier: 'premium',
    budgetRemainingFraction: 0.8,
    complexityScore: 50,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  DEFAULT_COST_AWARE_CONFIG                                          */
/* ------------------------------------------------------------------ */

describe('DEFAULT_COST_AWARE_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_COST_AWARE_CONFIG.premiumThreshold).toBe(0.5);
    expect(DEFAULT_COST_AWARE_CONFIG.standardThreshold).toBe(0.2);
    expect(DEFAULT_COST_AWARE_CONFIG.highComplexityFloor).toBe(70);
  });
});

/* ------------------------------------------------------------------ */
/*  applyCostAwareTier                                                 */
/* ------------------------------------------------------------------ */

describe('applyCostAwareTier', () => {

  /* ---------------------------------------------------------------- */
  /*  No budget tracking                                               */
  /* ---------------------------------------------------------------- */

  describe('no budget tracking', () => {
    it('passes through desired tier when budget fraction is undefined', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: undefined,
      }));

      expect(result.tier).toBe('premium');
      expect(result.downgraded).toBe(false);
      expect(result.highComplexityOverride).toBe(false);
      expect(result.budgetSnapshot).toBeUndefined();
      expect(result.reason).toBe('no budget tracking active');
    });

    it('passes through economy tier when budget fraction is undefined', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'economy',
        budgetRemainingFraction: undefined,
      }));

      expect(result.tier).toBe('economy');
      expect(result.downgraded).toBe(false);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Budget within bounds (no downgrade needed)                       */
  /* ---------------------------------------------------------------- */

  describe('budget within bounds', () => {
    it('allows premium when budget > 50% (AC1)', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.8,
      }));

      expect(result.tier).toBe('premium');
      expect(result.downgraded).toBe(false);
      expect(result.budgetAllowedTier).toBe('premium');
    });

    it('allows premium at exactly 50% threshold', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.5,
      }));

      expect(result.tier).toBe('premium');
      expect(result.downgraded).toBe(false);
    });

    it('allows standard when budget > 20% and desired is standard', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'standard',
        budgetRemainingFraction: 0.35,
      }));

      expect(result.tier).toBe('standard');
      expect(result.downgraded).toBe(false);
    });

    it('allows economy at any budget level', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'economy',
        budgetRemainingFraction: 0.05,
      }));

      expect(result.tier).toBe('economy');
      expect(result.downgraded).toBe(false);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Budget-triggered downgrade (AC2, AC3)                            */
  /* ---------------------------------------------------------------- */

  describe('budget-triggered downgrade', () => {
    it('downgrades premium to standard when budget 20-50% (AC2)', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.35,
        complexityScore: 50,
      }));

      expect(result.tier).toBe('standard');
      expect(result.downgraded).toBe(true);
      expect(result.budgetAllowedTier).toBe('standard');
    });

    it('downgrades premium to economy when budget < 20% (AC3)', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.1,
        complexityScore: 50,
      }));

      expect(result.tier).toBe('economy');
      expect(result.downgraded).toBe(true);
      expect(result.budgetAllowedTier).toBe('economy');
    });

    it('downgrades standard to economy when budget < 20%', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'standard',
        budgetRemainingFraction: 0.15,
        complexityScore: 50,
      }));

      expect(result.tier).toBe('economy');
      expect(result.downgraded).toBe(true);
      expect(result.budgetAllowedTier).toBe('economy');
    });

    it('downgrades premium to standard just below 50% threshold', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.499,
        complexityScore: 50,
      }));

      expect(result.tier).toBe('standard');
      expect(result.downgraded).toBe(true);
    });

    it('downgrades to economy just below 20% threshold', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.199,
        complexityScore: 50,
      }));

      expect(result.tier).toBe('economy');
      expect(result.downgraded).toBe(true);
    });

    it('economy desired stays economy at 0% budget', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'economy',
        budgetRemainingFraction: 0,
      }));

      expect(result.tier).toBe('economy');
      expect(result.downgraded).toBe(false);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  High-complexity override (AC4)                                   */
  /* ---------------------------------------------------------------- */

  describe('high-complexity override', () => {
    it('upgrades economy to standard for high-complexity premium tasks (AC4)', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.1,
        complexityScore: 85,
      }));

      expect(result.tier).toBe('standard');
      expect(result.downgraded).toBe(true);
      expect(result.highComplexityOverride).toBe(true);
      expect(result.budgetAllowedTier).toBe('economy');
    });

    it('upgrades economy to standard for high-complexity standard tasks', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'standard',
        budgetRemainingFraction: 0.1,
        complexityScore: 75,
      }));

      expect(result.tier).toBe('standard');
      expect(result.downgraded).toBe(false);
      expect(result.highComplexityOverride).toBe(true);
    });

    it('does not upgrade beyond desired tier', () => {
      // Desired tier is standard, budget allows economy → override upgrades to standard (cap)
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'standard',
        budgetRemainingFraction: 0.1,
        complexityScore: 85,
      }));

      expect(result.tier).toBe('standard');
      // Override applied: economy → standard, which equals desired, so not downgraded
      expect(result.highComplexityOverride).toBe(true);
    });

    it('does not apply override at exactly the threshold', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.1,
        complexityScore: 70, // exactly at threshold, not above
      }));

      expect(result.tier).toBe('economy');
      expect(result.highComplexityOverride).toBe(false);
    });

    it('does not apply override below the threshold', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.1,
        complexityScore: 50,
      }));

      expect(result.tier).toBe('economy');
      expect(result.highComplexityOverride).toBe(false);
    });

    it('override does not exceed desired tier for economy desired', () => {
      // Desired is economy, budget is economy — even high complexity should NOT upgrade
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'economy',
        budgetRemainingFraction: 0.1,
        complexityScore: 95,
      }));

      // economy desired is within budget (economy) — no downgrade, no override needed
      expect(result.tier).toBe('economy');
      expect(result.downgraded).toBe(false);
      expect(result.highComplexityOverride).toBe(false);
    });

    it('override with standard budget and premium desired', () => {
      // Budget allows standard, desired is premium, high complexity
      // Standard is already budget-allowed, override upgrades to premium
      // but cap at desired (premium) — so final = premium? No:
      // Budget allows standard, desired = premium → downgrade to standard
      // Override upgrades standard → premium, but compareTiers(premium, premium) <= 0 → apply
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.35,
        complexityScore: 85,
      }));

      expect(result.tier).toBe('premium');
      expect(result.highComplexityOverride).toBe(true);
      expect(result.downgraded).toBe(false);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Budget snapshot and reason (AC5)                                 */
  /* ---------------------------------------------------------------- */

  describe('budget snapshot and reason', () => {
    it('includes budget snapshot in result (AC5)', () => {
      const result = applyCostAwareTier(makeInput({
        budgetRemainingFraction: 0.42,
      }));

      expect(result.budgetSnapshot).toBe(0.42);
    });

    it('includes human-readable reason with budget percentage', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.35,
        complexityScore: 50,
      }));

      expect(result.reason).toContain('35.0%');
      expect(result.reason).toContain('standard');
    });

    it('includes high-complexity note in reason when override applied', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.1,
        complexityScore: 85,
      }));

      expect(result.reason).toContain('high-complexity override');
      expect(result.reason).toContain('85');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Edge cases                                                       */
  /* ---------------------------------------------------------------- */

  describe('edge cases', () => {
    it('clamps budget fraction > 1 to 1', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 1.5,
      }));

      expect(result.tier).toBe('premium');
      expect(result.budgetSnapshot).toBe(1);
    });

    it('clamps budget fraction < 0 to 0', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: -0.1,
        complexityScore: 50,
      }));

      expect(result.tier).toBe('economy');
      expect(result.budgetSnapshot).toBe(0);
    });

    it('handles budget fraction of exactly 0', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0,
        complexityScore: 50,
      }));

      expect(result.tier).toBe('economy');
      expect(result.budgetSnapshot).toBe(0);
    });

    it('handles budget fraction of exactly 1', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 1,
      }));

      expect(result.tier).toBe('premium');
      expect(result.budgetSnapshot).toBe(1);
    });

    it('treats NaN budget fraction as no budget tracking', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: NaN,
      }));

      expect(result.tier).toBe('premium');
      expect(result.downgraded).toBe(false);
      expect(result.budgetSnapshot).toBeUndefined();
      expect(result.reason).toBe('no budget tracking active');
    });

    it('handles complexity score of 0', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.1,
        complexityScore: 0,
      }));

      expect(result.tier).toBe('economy');
      expect(result.highComplexityOverride).toBe(false);
    });

    it('handles complexity score of 100', () => {
      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.1,
        complexityScore: 100,
      }));

      expect(result.tier).toBe('standard');
      expect(result.highComplexityOverride).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Custom config                                                    */
  /* ---------------------------------------------------------------- */

  describe('custom config', () => {
    it('respects custom premium threshold', () => {
      const config: CostAwareTierConfig = {
        premiumThreshold: 0.8,
        standardThreshold: 0.3,
        highComplexityFloor: 70,
      };

      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.6,
        complexityScore: 50,
      }), config);

      // 60% < 80% premium threshold → downgrade to standard
      expect(result.tier).toBe('standard');
      expect(result.downgraded).toBe(true);
    });

    it('respects custom standard threshold', () => {
      const config: CostAwareTierConfig = {
        premiumThreshold: 0.5,
        standardThreshold: 0.4,
        highComplexityFloor: 70,
      };

      const result = applyCostAwareTier(makeInput({
        desiredTier: 'standard',
        budgetRemainingFraction: 0.35,
        complexityScore: 50,
      }), config);

      // 35% < 40% standard threshold → downgrade to economy
      expect(result.tier).toBe('economy');
      expect(result.downgraded).toBe(true);
    });

    it('respects custom high-complexity floor', () => {
      const config: CostAwareTierConfig = {
        premiumThreshold: 0.5,
        standardThreshold: 0.2,
        highComplexityFloor: 90,
      };

      const result = applyCostAwareTier(makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.1,
        complexityScore: 85,
      }), config);

      // 85 < 90 custom floor → no override
      expect(result.tier).toBe('economy');
      expect(result.highComplexityOverride).toBe(false);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Purity                                                           */
  /* ---------------------------------------------------------------- */

  describe('purity', () => {
    it('is deterministic for the same inputs', () => {
      const input = makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.35,
        complexityScore: 85,
      });

      const result1 = applyCostAwareTier(input);
      const result2 = applyCostAwareTier(input);

      expect(result1).toEqual(result2);
    });

    it('does not mutate the input', () => {
      const input = makeInput({
        desiredTier: 'premium',
        budgetRemainingFraction: 0.1,
        complexityScore: 85,
      });

      const inputCopy = { ...input };
      applyCostAwareTier(input);

      expect(input).toEqual(inputCopy);
    });

    it('does not mutate the config', () => {
      const config: CostAwareTierConfig = {
        premiumThreshold: 0.5,
        standardThreshold: 0.2,
        highComplexityFloor: 70,
      };

      const configCopy = { ...config };
      applyCostAwareTier(makeInput(), config);

      expect(config).toEqual(configCopy);
    });
  });
});
