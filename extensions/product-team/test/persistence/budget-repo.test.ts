import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteBudgetRepository } from '../../src/persistence/budget-repo.js';
import { createBudgetRecord, BudgetScope, BudgetStatus } from '../../src/domain/budget.js';
import { BudgetNotFoundError, BudgetStaleRevisionError } from '../../src/domain/errors.js';

const TEST_NOW = '2026-03-08T12:00:00.000Z';
const TEST_LATER = '2026-03-08T13:00:00.000Z';

describe('SqliteBudgetRepository', () => {
  let db: Database.Database;
  let repo: SqliteBudgetRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteBudgetRepository(db);
  });

  afterEach(() => {
    db?.close();
  });

  describe('create', () => {
    it('inserts a budget record', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000, limitUsd: 5.0 },
        'budget-001',
        TEST_NOW,
      );

      const created = repo.create(record);

      expect(created.id).toBe('budget-001');
      expect(created.scope).toBe(BudgetScope.Global);
      expect(created.limitTokens).toBe(10000);
    });

    it('rejects duplicate scope/scopeId', () => {
      const record1 = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
        'budget-001',
        TEST_NOW,
      );
      const record2 = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 20000 },
        'budget-002',
        TEST_NOW,
      );

      repo.create(record1);
      expect(() => repo.create(record2)).toThrow();
    });
  });

  describe('getById', () => {
    it('returns a record by id', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1', limitTokens: 5000 },
        'budget-010',
        TEST_NOW,
      );
      repo.create(record);

      const result = repo.getById('budget-010');

      expect(result).not.toBeNull();
      expect(result!.scope).toBe(BudgetScope.Pipeline);
      expect(result!.scopeId).toBe('pipe-1');
    });

    it('returns null for missing id', () => {
      expect(repo.getById('nonexistent')).toBeNull();
    });
  });

  describe('getByScope', () => {
    it('returns a record by scope and scopeId', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Agent, scopeId: 'back-1', limitTokens: 2000 },
        'budget-020',
        TEST_NOW,
      );
      repo.create(record);

      const result = repo.getByScope(BudgetScope.Agent, 'back-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('budget-020');
    });

    it('returns null for missing scope', () => {
      expect(repo.getByScope(BudgetScope.Agent, 'nonexistent')).toBeNull();
    });
  });

  describe('listByScope', () => {
    it('lists all records for a scope', () => {
      repo.create(
        createBudgetRecord(
          { scope: BudgetScope.Agent, scopeId: 'back-1', limitTokens: 2000 },
          'budget-030',
          TEST_NOW,
        ),
      );
      repo.create(
        createBudgetRecord(
          { scope: BudgetScope.Agent, scopeId: 'front-1', limitTokens: 1500 },
          'budget-031',
          TEST_NOW,
        ),
      );
      repo.create(
        createBudgetRecord(
          { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
          'budget-032',
          TEST_NOW,
        ),
      );

      const agents = repo.listByScope(BudgetScope.Agent);

      expect(agents).toHaveLength(2);
      expect(agents.map((r) => r.scopeId)).toEqual(['back-1', 'front-1']);
    });
  });

  describe('listByStatus', () => {
    it('lists records filtered by status', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 100 },
        'budget-040',
        TEST_NOW,
      );
      repo.create(record);

      const active = repo.listByStatus(BudgetStatus.Active);
      expect(active).toHaveLength(1);

      const exhausted = repo.listByStatus(BudgetStatus.Exhausted);
      expect(exhausted).toHaveLength(0);
    });
  });

  describe('updateConsumption', () => {
    it('updates consumed tokens, usd, and status', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000, limitUsd: 5.0 },
        'budget-050',
        TEST_NOW,
      );
      repo.create(record);

      const updated = repo.updateConsumption(
        'budget-050',
        8500,
        4.2,
        BudgetStatus.Warning,
        0,
        TEST_LATER,
      );

      expect(updated.consumedTokens).toBe(8500);
      expect(updated.consumedUsd).toBeCloseTo(4.2);
      expect(updated.status).toBe(BudgetStatus.Warning);
      expect(updated.rev).toBe(1);
      expect(updated.updatedAt).toBe(TEST_LATER);
    });

    it('throws BudgetNotFoundError for missing id', () => {
      expect(() =>
        repo.updateConsumption('nonexistent', 100, 0, BudgetStatus.Active, 0, TEST_LATER),
      ).toThrow(BudgetNotFoundError);
    });

    it('throws StaleRevisionError on rev mismatch', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
        'budget-051',
        TEST_NOW,
      );
      repo.create(record);

      // Update once to bump rev to 1
      repo.updateConsumption('budget-051', 100, 0, BudgetStatus.Active, 0, TEST_LATER);

      // Attempt update with stale rev 0
      expect(() =>
        repo.updateConsumption('budget-051', 200, 0, BudgetStatus.Active, 0, TEST_LATER),
      ).toThrow(BudgetStaleRevisionError);
    });
  });

  describe('replenish', () => {
    it('adds to limits and resets status to active', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000, limitUsd: 5.0 },
        'budget-060',
        TEST_NOW,
      );
      repo.create(record);

      // Mark as exhausted first
      repo.updateConsumption('budget-060', 10000, 5.0, BudgetStatus.Exhausted, 0, TEST_NOW);

      const replenished = repo.replenish('budget-060', 5000, 2.5, 1, TEST_LATER);

      expect(replenished.limitTokens).toBe(15000);
      expect(replenished.limitUsd).toBeCloseTo(7.5);
      expect(replenished.status).toBe(BudgetStatus.Active);
      expect(replenished.rev).toBe(2);
    });

    it('throws BudgetNotFoundError for missing id', () => {
      expect(() => repo.replenish('nonexistent', 1000, 0, 0, TEST_LATER)).toThrow(
        BudgetNotFoundError,
      );
    });
  });

  describe('resetConsumption', () => {
    it('resets consumed values and status to active', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
        'budget-070',
        TEST_NOW,
      );
      repo.create(record);

      repo.updateConsumption('budget-070', 9000, 0, BudgetStatus.Warning, 0, TEST_NOW);

      const reset = repo.resetConsumption('budget-070', 1, TEST_LATER);

      expect(reset.consumedTokens).toBe(0);
      expect(reset.consumedUsd).toBe(0);
      expect(reset.status).toBe(BudgetStatus.Active);
      expect(reset.rev).toBe(2);
    });
  });

  describe('delete', () => {
    it('deletes a record and returns true', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
        'budget-080',
        TEST_NOW,
      );
      repo.create(record);

      const deleted = repo.delete('budget-080');

      expect(deleted).toBe(true);
      expect(repo.getById('budget-080')).toBeNull();
    });

    it('returns false for missing id', () => {
      expect(repo.delete('nonexistent')).toBe(false);
    });
  });
});
