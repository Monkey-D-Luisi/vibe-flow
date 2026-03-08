import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteBudgetRepository } from '../../src/persistence/budget-repo.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import {
  createBudgetRecord,
  BudgetScope,
  BudgetStatus,
} from '../../src/domain/budget.js';
import { BudgetExhaustedError } from '../../src/domain/errors.js';
import {
  checkBudget,
  enforceBudget,
  recordConsumption,
  buildScopeChain,
} from '../../src/orchestrator/budget-guard.js';
import type { BudgetGuardDeps } from '../../src/orchestrator/budget-guard.js';

const TEST_NOW = '2026-03-08T12:00:00.000Z';
let idCounter = 0;

function createDeps(db: Database.Database): BudgetGuardDeps {
  const budgetRepo = new SqliteBudgetRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const eventLog = new EventLog(
    eventRepo,
    () => `evt-${++idCounter}`,
    () => TEST_NOW,
  );
  return {
    budgetRepo,
    eventLog,
    generateId: () => `id-${++idCounter}`,
    now: () => TEST_NOW,
  };
}

describe('budget-guard', () => {
  let db: Database.Database;
  let deps: BudgetGuardDeps;

  beforeEach(() => {
    db = createTestDatabase();
    deps = createDeps(db);
    idCounter = 0;

    // Insert a task record for event log FK constraint
    db.prepare(
      `INSERT INTO task_records (id, title, status, scope, created_at, updated_at, rev)
       VALUES ('task-1', 'Test Task', 'backlog', 'minor', ?, ?, 0)`,
    ).run(TEST_NOW, TEST_NOW);
  });

  afterEach(() => {
    db?.close();
  });

  describe('checkBudget', () => {
    it('allows when no budgets are configured', () => {
      const result = checkBudget(deps, [
        { scope: BudgetScope.Global, scopeId: 'default' },
      ]);

      expect(result.allowed).toBe(true);
    });

    it('allows when budget is active', () => {
      deps.budgetRepo.create(
        createBudgetRecord(
          { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
          'b-1',
          TEST_NOW,
        ),
      );

      const result = checkBudget(deps, [
        { scope: BudgetScope.Global, scopeId: 'default' },
      ]);

      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(10000);
    });

    it('denies when budget is exhausted', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
        'b-2',
        TEST_NOW,
      );
      deps.budgetRepo.create(record);
      deps.budgetRepo.updateConsumption(
        'b-2',
        10000,
        0,
        BudgetStatus.Exhausted,
        0,
        TEST_NOW,
      );

      const result = checkBudget(deps, [
        { scope: BudgetScope.Global, scopeId: 'default' },
      ]);

      expect(result.allowed).toBe(false);
      expect(result.scope).toBe(BudgetScope.Global);
      expect(result.status).toBe(BudgetStatus.Exhausted);
    });

    it('checks scopes in order and stops at first exhausted', () => {
      // Global is active
      deps.budgetRepo.create(
        createBudgetRecord(
          { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 100000 },
          'b-global',
          TEST_NOW,
        ),
      );

      // Pipeline is exhausted
      const pipeRecord = createBudgetRecord(
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1', limitTokens: 1000 },
        'b-pipe',
        TEST_NOW,
      );
      deps.budgetRepo.create(pipeRecord);
      deps.budgetRepo.updateConsumption(
        'b-pipe',
        1000,
        0,
        BudgetStatus.Exhausted,
        0,
        TEST_NOW,
      );

      const result = checkBudget(deps, [
        { scope: BudgetScope.Global, scopeId: 'default' },
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1' },
      ]);

      expect(result.allowed).toBe(false);
      expect(result.scope).toBe(BudgetScope.Pipeline);
    });

    it('returns most constrained scope info when all pass', () => {
      deps.budgetRepo.create(
        createBudgetRecord(
          { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 100000 },
          'b-g',
          TEST_NOW,
        ),
      );
      const agentRecord = createBudgetRecord(
        { scope: BudgetScope.Agent, scopeId: 'back-1', limitTokens: 500 },
        'b-a',
        TEST_NOW,
      );
      deps.budgetRepo.create(agentRecord);

      const result = checkBudget(deps, [
        { scope: BudgetScope.Global, scopeId: 'default' },
        { scope: BudgetScope.Agent, scopeId: 'back-1' },
      ]);

      expect(result.allowed).toBe(true);
      expect(result.scope).toBe(BudgetScope.Agent);
      expect(result.remainingTokens).toBe(500);
    });
  });

  describe('enforceBudget', () => {
    it('returns ok when budget allows', () => {
      deps.budgetRepo.create(
        createBudgetRecord(
          { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
          'b-e1',
          TEST_NOW,
        ),
      );

      const result = enforceBudget(deps, [
        { scope: BudgetScope.Global, scopeId: 'default' },
      ]);

      expect(result.allowed).toBe(true);
    });

    it('throws BudgetExhaustedError when budget is exhausted', () => {
      const record = createBudgetRecord(
        { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 100 },
        'b-e2',
        TEST_NOW,
      );
      deps.budgetRepo.create(record);
      deps.budgetRepo.updateConsumption(
        'b-e2',
        100,
        0,
        BudgetStatus.Exhausted,
        0,
        TEST_NOW,
      );

      expect(() =>
        enforceBudget(deps, [
          { scope: BudgetScope.Global, scopeId: 'default' },
        ]),
      ).toThrow(BudgetExhaustedError);
    });
  });

  describe('recordConsumption', () => {
    it('records consumption and returns no transitions for small amounts', () => {
      deps.budgetRepo.create(
        createBudgetRecord(
          { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000, limitUsd: 10.0 },
          'b-r1',
          TEST_NOW,
        ),
      );

      const transitions = recordConsumption(
        deps,
        [{ scope: BudgetScope.Global, scopeId: 'default' }],
        { tokens: 100, usd: 0.1 },
        'task-1',
        'back-1',
      );

      expect(transitions).toHaveLength(0);

      const updated = deps.budgetRepo.getByScope(BudgetScope.Global, 'default')!;
      expect(updated.consumedTokens).toBe(100);
      expect(updated.consumedUsd).toBeCloseTo(0.1);
      expect(updated.status).toBe(BudgetStatus.Active);
    });

    it('emits transition event when crossing warning threshold', () => {
      deps.budgetRepo.create(
        createBudgetRecord(
          { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
          'b-r2',
          TEST_NOW,
        ),
      );

      const transitions = recordConsumption(
        deps,
        [{ scope: BudgetScope.Global, scopeId: 'default' }],
        { tokens: 8500, usd: 0 },
        'task-1',
        'back-1',
      );

      expect(transitions).toHaveLength(1);
      expect(transitions[0].from).toBe(BudgetStatus.Active);
      expect(transitions[0].to).toBe(BudgetStatus.Warning);

      // Verify event was emitted
      const events = deps.eventLog.getHistory('task-1');
      const budgetEvents = events.filter((e) => e.eventType === 'budget.transition');
      expect(budgetEvents).toHaveLength(1);
      expect(budgetEvents[0].payload).toMatchObject({
        scope: 'global',
        from: 'active',
        to: 'warning',
      });
    });

    it('records consumption across multiple scopes', () => {
      deps.budgetRepo.create(
        createBudgetRecord(
          { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 100000 },
          'b-r3-g',
          TEST_NOW,
        ),
      );
      deps.budgetRepo.create(
        createBudgetRecord(
          { scope: BudgetScope.Agent, scopeId: 'back-1', limitTokens: 1000 },
          'b-r3-a',
          TEST_NOW,
        ),
      );

      const transitions = recordConsumption(
        deps,
        [
          { scope: BudgetScope.Global, scopeId: 'default' },
          { scope: BudgetScope.Agent, scopeId: 'back-1' },
        ],
        { tokens: 900, usd: 0 },
        'task-1',
        'back-1',
      );

      // Agent should hit warning (900/1000 = 0.9 >= 0.8)
      expect(transitions).toHaveLength(1);
      expect(transitions[0].scope).toBe(BudgetScope.Agent);
      expect(transitions[0].to).toBe(BudgetStatus.Warning);

      // Both scopes should have consumed tokens
      expect(deps.budgetRepo.getByScope(BudgetScope.Global, 'default')!.consumedTokens).toBe(900);
      expect(deps.budgetRepo.getByScope(BudgetScope.Agent, 'back-1')!.consumedTokens).toBe(900);
    });

    it('skips scopes with no budget configured', () => {
      deps.budgetRepo.create(
        createBudgetRecord(
          { scope: BudgetScope.Global, scopeId: 'default', limitTokens: 10000 },
          'b-r4',
          TEST_NOW,
        ),
      );

      // No pipeline budget configured
      const transitions = recordConsumption(
        deps,
        [
          { scope: BudgetScope.Global, scopeId: 'default' },
          { scope: BudgetScope.Pipeline, scopeId: 'pipe-1' },
        ],
        { tokens: 100, usd: 0 },
        'task-1',
        null,
      );

      expect(transitions).toHaveLength(0);
      expect(deps.budgetRepo.getByScope(BudgetScope.Global, 'default')!.consumedTokens).toBe(100);
    });
  });

  describe('buildScopeChain', () => {
    it('always includes global as first scope', () => {
      const chain = buildScopeChain({});
      expect(chain).toEqual([{ scope: 'global', scopeId: 'default' }]);
    });

    it('includes all provided scopes in order', () => {
      const chain = buildScopeChain({
        pipelineId: 'pipe-1',
        stageName: 'IMPLEMENTATION',
        agentId: 'back-1',
      });

      expect(chain).toEqual([
        { scope: 'global', scopeId: 'default' },
        { scope: 'pipeline', scopeId: 'pipe-1' },
        { scope: 'stage', scopeId: 'IMPLEMENTATION' },
        { scope: 'agent', scopeId: 'back-1' },
      ]);
    });

    it('includes only provided scopes', () => {
      const chain = buildScopeChain({ pipelineId: 'pipe-1' });

      expect(chain).toEqual([
        { scope: 'global', scopeId: 'default' },
        { scope: 'pipeline', scopeId: 'pipe-1' },
      ]);
    });
  });
});
