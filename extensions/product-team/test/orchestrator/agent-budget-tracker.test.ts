import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { PricingTable } from '../../src/domain/pricing-table.js';
import type { BudgetGuardDeps } from '../../src/orchestrator/budget-guard.js';
import {
  extractTokenUsage,
  ensureAgentBudgets,
  trackAgentConsumption,
  checkAgentBudget,
  resolveAllocations,
  agentScopeId,
} from '../../src/orchestrator/agent-budget-tracker.js';
import type { AgentBudgetTrackerDeps } from '../../src/orchestrator/agent-budget-tracker.js';

const TEST_NOW = '2026-03-09T12:00:00.000Z';
let idCounter = 0;

function createDeps(db: Database.Database): {
  budgetGuardDeps: BudgetGuardDeps;
  budgetRepo: SqliteBudgetRepository;
  trackerDeps: AgentBudgetTrackerDeps;
} {
  const budgetRepo = new SqliteBudgetRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const eventLog = new EventLog(
    eventRepo,
    () => `evt-${++idCounter}`,
    () => TEST_NOW,
  );
  const budgetGuardDeps: BudgetGuardDeps = {
    budgetRepo,
    eventLog,
    now: () => TEST_NOW,
  };
  const pricingTable = new PricingTable();
  const trackerDeps: AgentBudgetTrackerDeps = {
    budgetRepo,
    budgetGuardDeps,
    pricingTable,
    generateId: () => `budget-${++idCounter}`,
    now: () => TEST_NOW,
    allocations: { pm: 0.05, 'back-1': 0.25, qa: 0.10 },
  };
  return { budgetGuardDeps, budgetRepo, trackerDeps };
}

describe('agent-budget-tracker', () => {
  let db: Database.Database;
  let budgetRepo: SqliteBudgetRepository;
  let trackerDeps: AgentBudgetTrackerDeps;

  beforeEach(() => {
    db = createTestDatabase();
    const d = createDeps(db);
    budgetRepo = d.budgetRepo;
    trackerDeps = d.trackerDeps;
    idCounter = 0;
  });

  afterEach(() => {
    db.close();
  });

  describe('extractTokenUsage', () => {
    it('returns null when no result', () => {
      expect(extractTokenUsage({ toolName: 'test' })).toBeNull();
    });

    it('returns null when no usage in result', () => {
      expect(extractTokenUsage({ toolName: 'test', result: { data: 'ok' } })).toBeNull();
    });

    it('extracts usage from result.usage', () => {
      const usage = extractTokenUsage({
        toolName: 'test',
        result: {
          usage: { inputTokens: 100, outputTokens: 50, model: 'gpt-4.1', provider: 'openai' },
        },
      });
      expect(usage).not.toBeNull();
      expect(usage!.inputTokens).toBe(100);
      expect(usage!.outputTokens).toBe(50);
      expect(usage!.model).toBe('gpt-4.1');
      expect(usage!.provider).toBe('openai');
    });

    it('extracts usage from result.details.usage', () => {
      const usage = extractTokenUsage({
        toolName: 'test',
        result: {
          details: {
            usage: { inputTokens: 200, outputTokens: 100 },
          },
        },
      });
      expect(usage).not.toBeNull();
      expect(usage!.inputTokens).toBe(200);
      expect(usage!.outputTokens).toBe(100);
    });

    it('returns null when tokens are zero', () => {
      expect(extractTokenUsage({
        toolName: 'test',
        result: { usage: { inputTokens: 0, outputTokens: 0 } },
      })).toBeNull();
    });

    it('handles missing model/provider gracefully', () => {
      const usage = extractTokenUsage({
        toolName: 'test',
        result: { usage: { inputTokens: 50, outputTokens: 25 } },
      });
      expect(usage).not.toBeNull();
      expect(usage!.model).toBeUndefined();
      expect(usage!.provider).toBeUndefined();
    });
  });

  describe('agentScopeId', () => {
    it('creates composite scope id', () => {
      expect(agentScopeId('pipe-1', 'back-1')).toBe('pipe-1::back-1');
    });
  });

  describe('resolveAllocations', () => {
    it('returns defaults when no overrides', () => {
      const allocs = resolveAllocations();
      expect(allocs['pm']).toBe(0.05);
      expect(allocs['back-1']).toBe(0.25);
    });

    it('merges overrides with defaults', () => {
      const allocs = resolveAllocations({ pm: 0.15, 'custom-agent': 0.10 });
      expect(allocs['pm']).toBe(0.15);
      expect(allocs['custom-agent']).toBe(0.10);
      expect(allocs['back-1']).toBe(0.25); // default preserved
    });
  });

  describe('ensureAgentBudgets', () => {
    it('returns 0 when no pipeline budget exists', () => {
      const created = ensureAgentBudgets(trackerDeps, 'pipe-1', ['pm', 'back-1']);
      expect(created).toBe(0);
    });

    it('creates agent budgets from pipeline budget', () => {
      // Create pipeline budget: 100k tokens, $10 USD
      const pipelineBudget = createBudgetRecord(
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1', limitTokens: 100000, limitUsd: 10 },
        'budget-pipeline',
        TEST_NOW,
      );
      budgetRepo.create(pipelineBudget);

      const created = ensureAgentBudgets(trackerDeps, 'pipe-1', ['pm', 'back-1', 'qa']);
      expect(created).toBe(3);

      // Verify pm budget (5% of 100k = 5000 tokens)
      const pmBudget = budgetRepo.getByScope(BudgetScope.Agent, 'pipe-1::pm');
      expect(pmBudget).not.toBeNull();
      expect(pmBudget!.limitTokens).toBe(5000);
      expect(pmBudget!.limitUsd).toBeCloseTo(0.5, 6);

      // Verify back-1 budget (25% of 100k = 25000 tokens)
      const backBudget = budgetRepo.getByScope(BudgetScope.Agent, 'pipe-1::back-1');
      expect(backBudget).not.toBeNull();
      expect(backBudget!.limitTokens).toBe(25000);
      expect(backBudget!.limitUsd).toBeCloseTo(2.5, 6);
    });

    it('skips agents with zero allocation', () => {
      const pipelineBudget = createBudgetRecord(
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1', limitTokens: 100000 },
        'budget-pipeline',
        TEST_NOW,
      );
      budgetRepo.create(pipelineBudget);

      // 'unknown-agent' has no allocation in test deps
      const created = ensureAgentBudgets(trackerDeps, 'pipe-1', ['pm', 'unknown-agent']);
      expect(created).toBe(1); // only pm
    });

    it('does not recreate existing agent budgets', () => {
      const pipelineBudget = createBudgetRecord(
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1', limitTokens: 100000 },
        'budget-pipeline',
        TEST_NOW,
      );
      budgetRepo.create(pipelineBudget);

      ensureAgentBudgets(trackerDeps, 'pipe-1', ['pm']);
      const second = ensureAgentBudgets(trackerDeps, 'pipe-1', ['pm']);
      expect(second).toBe(0);
    });
  });

  describe('trackAgentConsumption', () => {
    it('records consumption to agent budget', () => {
      // Setup: pipeline budget + agent budget
      const pipelineBudget = createBudgetRecord(
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1', limitTokens: 100000, limitUsd: 10 },
        'budget-pipeline',
        TEST_NOW,
      );
      budgetRepo.create(pipelineBudget);
      ensureAgentBudgets(trackerDeps, 'pipe-1', ['back-1']);

      // Insert task for event log FK
      db.prepare(
        `INSERT INTO task_records (id, title, status, scope, created_at, updated_at, rev)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('task-1', 'Test', 'IN_PROGRESS', 'minor', TEST_NOW, TEST_NOW, 0);

      // Track 1000 input + 500 output tokens with openai/gpt-4.1
      trackAgentConsumption(
        trackerDeps,
        'back-1',
        'pipe-1',
        'task-1',
        1000,
        500,
        'openai',
        'gpt-4.1',
      );

      const agentBudget = budgetRepo.getByScope(BudgetScope.Agent, 'pipe-1::back-1');
      expect(agentBudget).not.toBeNull();
      expect(agentBudget!.consumedTokens).toBe(1500);
      // USD: (1000/1000)*0.002 + (500/1000)*0.008 = 0.002 + 0.004 = 0.006
      expect(agentBudget!.consumedUsd).toBeCloseTo(0.006, 6);
    });

    it('tracks consumption without provider/model (zero USD)', () => {
      const pipelineBudget = createBudgetRecord(
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1', limitTokens: 100000, limitUsd: 10 },
        'budget-pipeline',
        TEST_NOW,
      );
      budgetRepo.create(pipelineBudget);
      ensureAgentBudgets(trackerDeps, 'pipe-1', ['pm']);

      db.prepare(
        `INSERT INTO task_records (id, title, status, scope, created_at, updated_at, rev)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('task-2', 'Test2', 'IN_PROGRESS', 'minor', TEST_NOW, TEST_NOW, 0);

      trackAgentConsumption(trackerDeps, 'pm', 'pipe-1', 'task-2', 200, 100);

      const pmBudget = budgetRepo.getByScope(BudgetScope.Agent, 'pipe-1::pm');
      expect(pmBudget!.consumedTokens).toBe(300);
      expect(pmBudget!.consumedUsd).toBe(0);
    });
  });

  describe('checkAgentBudget', () => {
    it('allows when no budget configured', () => {
      const result = checkAgentBudget(trackerDeps, 'back-1', 'pipe-1');
      expect(result.allowed).toBe(true);
    });

    it('allows when budget is active', () => {
      const pipelineBudget = createBudgetRecord(
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1', limitTokens: 100000 },
        'budget-pipeline',
        TEST_NOW,
      );
      budgetRepo.create(pipelineBudget);
      ensureAgentBudgets(trackerDeps, 'pipe-1', ['back-1']);

      const result = checkAgentBudget(trackerDeps, 'back-1', 'pipe-1');
      expect(result.allowed).toBe(true);
    });

    it('denies when agent budget is exhausted', () => {
      const pipelineBudget = createBudgetRecord(
        { scope: BudgetScope.Pipeline, scopeId: 'pipe-1', limitTokens: 100000 },
        'budget-pipeline',
        TEST_NOW,
      );
      budgetRepo.create(pipelineBudget);
      ensureAgentBudgets(trackerDeps, 'pipe-1', ['back-1']);

      // Exhaust the agent budget manually
      const agentBudget = budgetRepo.getByScope(BudgetScope.Agent, 'pipe-1::back-1')!;
      budgetRepo.updateConsumption(
        agentBudget.id,
        agentBudget.limitTokens, // fully consumed
        0,
        BudgetStatus.Exhausted,
        agentBudget.rev,
        TEST_NOW,
      );

      const result = checkAgentBudget(trackerDeps, 'back-1', 'pipe-1');
      expect(result.allowed).toBe(false);
      expect(result.scope).toBe(BudgetScope.Agent);
    });
  });
});
