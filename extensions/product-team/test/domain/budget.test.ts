import { describe, it, expect } from 'vitest';
import {
  createBudgetRecord,
  computeBudgetStatus,
  isBudgetExhausted,
  remainingTokens,
  remainingUsd,
  consumptionRatio,
  BudgetScope,
  BudgetStatus,
  ALL_BUDGET_SCOPES,
  ALL_BUDGET_STATUSES,
} from '../../src/domain/budget.js';
import type { BudgetRecord, BudgetConsumption } from '../../src/domain/budget.js';

const TEST_ID = '01BUDGET_TEST_001';
const TEST_NOW = '2026-03-08T12:00:00.000Z';

describe('budget domain model', () => {
  describe('BudgetScope', () => {
    it('has all expected scope values', () => {
      expect(ALL_BUDGET_SCOPES).toEqual(['global', 'pipeline', 'stage', 'agent']);
    });

    it('has correct const values', () => {
      expect(BudgetScope.Global).toBe('global');
      expect(BudgetScope.Pipeline).toBe('pipeline');
      expect(BudgetScope.Stage).toBe('stage');
      expect(BudgetScope.Agent).toBe('agent');
    });
  });

  describe('BudgetStatus', () => {
    it('has all expected status values', () => {
      expect(ALL_BUDGET_STATUSES).toEqual(['active', 'warning', 'exhausted']);
    });
  });

  describe('createBudgetRecord', () => {
    it('creates a record with required fields', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
        TEST_ID,
        TEST_NOW,
      );

      expect(record.id).toBe(TEST_ID);
      expect(record.scope).toBe(BudgetScope.Global);
      expect(record.scopeId).toBe('default');
      expect(record.limitTokens).toBe(10000);
      expect(record.consumedTokens).toBe(0);
      expect(record.limitUsd).toBe(0);
      expect(record.consumedUsd).toBe(0);
      expect(record.status).toBe(BudgetStatus.Active);
      expect(record.warningThreshold).toBe(0.8);
      expect(record.createdAt).toBe(TEST_NOW);
      expect(record.updatedAt).toBe(TEST_NOW);
      expect(record.rev).toBe(0);
    });

    it('applies optional fields', () => {
      const record = createBudgetRecord(
        {
          scope: BudgetScope.Pipeline,
          scopeId: 'pipe-1',
          limitTokens: 5000,
          limitUsd: 2.5,
          warningThreshold: 0.7,
        },
        TEST_ID,
        TEST_NOW,
      );

      expect(record.limitUsd).toBe(2.5);
      expect(record.warningThreshold).toBe(0.7);
    });

    it('defaults limitUsd to 0 and warningThreshold to 0.8', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Agent, scopeId: 'back-1', limitTokens: 1000 },
        TEST_ID,
        TEST_NOW,
      );

      expect(record.limitUsd).toBe(0);
      expect(record.warningThreshold).toBe(0.8);
    });
  });

  describe('computeBudgetStatus', () => {
    function makeBudget(overrides: Partial<BudgetRecord> = {}): BudgetRecord {
      return {
        id: TEST_ID,
        scope: BudgetScope.Global,
        scopeId: 'default',
        limitTokens: 10000,
        consumedTokens: 0,
        limitUsd: 10.0,
        consumedUsd: 0,
        status: BudgetStatus.Active,
        warningThreshold: 0.8,
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
        rev: 0,
        ...overrides,
      };
    }

    it('stays active when consumption is below threshold', () => {
      const record = makeBudget();
      const consumption: BudgetConsumption = { tokens: 1000, usd: 1.0 };

      const result = computeBudgetStatus(record, consumption);

      expect(result.status).toBe(BudgetStatus.Active);
      expect(result.transition).toBeNull();
    });

    it('transitions to warning when token ratio crosses threshold', () => {
      const record = makeBudget({ consumedTokens: 7000 });
      const consumption: BudgetConsumption = { tokens: 1500, usd: 0 };

      const result = computeBudgetStatus(record, consumption);

      expect(result.status).toBe(BudgetStatus.Warning);
      expect(result.transition).not.toBeNull();
      expect(result.transition?.from).toBe(BudgetStatus.Active);
      expect(result.transition?.to).toBe(BudgetStatus.Warning);
    });

    it('transitions to warning when USD ratio crosses threshold', () => {
      const record = makeBudget({ consumedUsd: 7.0 });
      const consumption: BudgetConsumption = { tokens: 0, usd: 1.5 };

      const result = computeBudgetStatus(record, consumption);

      expect(result.status).toBe(BudgetStatus.Warning);
      expect(result.transition).not.toBeNull();
    });

    it('transitions to exhausted when token ratio reaches 1.0', () => {
      const record = makeBudget({ consumedTokens: 9000 });
      const consumption: BudgetConsumption = { tokens: 1000, usd: 0 };

      const result = computeBudgetStatus(record, consumption);

      expect(result.status).toBe(BudgetStatus.Exhausted);
      expect(result.transition).not.toBeNull();
      expect(result.transition?.to).toBe(BudgetStatus.Exhausted);
    });

    it('transitions to exhausted when USD ratio reaches 1.0', () => {
      const record = makeBudget({ consumedUsd: 9.0 });
      const consumption: BudgetConsumption = { tokens: 0, usd: 1.0 };

      const result = computeBudgetStatus(record, consumption);

      expect(result.status).toBe(BudgetStatus.Exhausted);
    });

    it('transitions to exhausted on overspend', () => {
      const record = makeBudget({ consumedTokens: 9500 });
      const consumption: BudgetConsumption = { tokens: 2000, usd: 0 };

      const result = computeBudgetStatus(record, consumption);

      expect(result.status).toBe(BudgetStatus.Exhausted);
      expect(result.transition?.consumedTokens).toBe(11500);
    });

    it('no transition when status stays the same', () => {
      const record = makeBudget({
        status: BudgetStatus.Warning,
        consumedTokens: 8500,
      });
      const consumption: BudgetConsumption = { tokens: 100, usd: 0 };

      const result = computeBudgetStatus(record, consumption);

      expect(result.status).toBe(BudgetStatus.Warning);
      expect(result.transition).toBeNull();
    });

    it('handles zero limit gracefully (no division by zero)', () => {
      const record = makeBudget({ limitTokens: 0, limitUsd: 0 });
      const consumption: BudgetConsumption = { tokens: 100, usd: 1 };

      const result = computeBudgetStatus(record, consumption);

      expect(result.status).toBe(BudgetStatus.Active);
    });

    it('uses the higher of token/USD ratios', () => {
      const record = makeBudget({
        limitTokens: 10000,
        consumedTokens: 0,
        limitUsd: 1.0,
        consumedUsd: 0.9,
      });
      const consumption: BudgetConsumption = { tokens: 100, usd: 0.05 };

      const result = computeBudgetStatus(record, consumption);

      // USD ratio is 0.95, token ratio is 0.01 → warning based on USD
      expect(result.status).toBe(BudgetStatus.Warning);
    });

    it('includes transition metadata', () => {
      const record = makeBudget({ consumedTokens: 9000 });
      const consumption: BudgetConsumption = { tokens: 1000, usd: 1.0 };

      const result = computeBudgetStatus(record, consumption);

      expect(result.transition).toEqual({
        from: BudgetStatus.Active,
        to: BudgetStatus.Exhausted,
        budgetId: TEST_ID,
        scope: BudgetScope.Global,
        scopeId: 'default',
        consumedTokens: 10000,
        limitTokens: 10000,
        consumedUsd: 1.0,
        limitUsd: 10.0,
      });
    });
  });

  describe('isBudgetExhausted', () => {
    it('returns true for exhausted status', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 100 },
        TEST_ID,
        TEST_NOW,
      );
      record.status = BudgetStatus.Exhausted;

      expect(isBudgetExhausted(record)).toBe(true);
    });

    it('returns false for active status', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 100 },
        TEST_ID,
        TEST_NOW,
      );

      expect(isBudgetExhausted(record)).toBe(false);
    });

    it('returns false for warning status', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 100 },
        TEST_ID,
        TEST_NOW,
      );
      record.status = BudgetStatus.Warning;

      expect(isBudgetExhausted(record)).toBe(false);
    });
  });

  describe('remainingTokens', () => {
    it('calculates remaining tokens', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
        TEST_ID,
        TEST_NOW,
      );
      record.consumedTokens = 3000;

      expect(remainingTokens(record)).toBe(7000);
    });

    it('returns 0 when overconsumed', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 1000 },
        TEST_ID,
        TEST_NOW,
      );
      record.consumedTokens = 2000;

      expect(remainingTokens(record)).toBe(0);
    });
  });

  describe('remainingUsd', () => {
    it('calculates remaining USD', () => {
      const record = createBudgetRecord(
        {
          scope: BudgetScope.Global,
          scopeId: 'default',
          limitTokens: 10000,
          limitUsd: 5.0,
        },
        TEST_ID,
        TEST_NOW,
      );
      record.consumedUsd = 2.0;

      expect(remainingUsd(record)).toBe(3.0);
    });

    it('returns 0 when overconsumed', () => {
      const record = createBudgetRecord(
        {
          scope: BudgetScope.Global,
          scopeId: 'default',
          limitTokens: 10000,
          limitUsd: 1.0,
        },
        TEST_ID,
        TEST_NOW,
      );
      record.consumedUsd = 2.0;

      expect(remainingUsd(record)).toBe(0);
    });
  });

  describe('consumptionRatio', () => {
    it('returns 0 for zero consumption', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
        TEST_ID,
        TEST_NOW,
      );

      expect(consumptionRatio(record)).toBe(0);
    });

    it('returns the higher of token/USD ratios', () => {
      const record = createBudgetRecord(
        {
          scope: BudgetScope.Global,
          scopeId: 'default',
          limitTokens: 10000,
          limitUsd: 10.0,
        },
        TEST_ID,
        TEST_NOW,
      );
      record.consumedTokens = 5000;
      record.consumedUsd = 8.0;

      // token ratio 0.5, USD ratio 0.8 → max is 0.8
      expect(consumptionRatio(record)).toBe(0.8);
    });

    it('handles zero limits gracefully', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 0 },
        TEST_ID,
        TEST_NOW,
      );

      expect(consumptionRatio(record)).toBe(0);
    });
  });
});
