/**
 * Budget guard -- enforcement logic for hard budget limits.
 *
 * Checks budget availability before LLM requests and records consumption
 * after requests complete. Emits structured events on status transitions.
 */

import type {
  BudgetConsumption,
  BudgetStatusTransition,
  BudgetScope,
} from '../domain/budget.js';
import {
  computeBudgetStatus,
  isBudgetExhausted,
  BudgetStatus,
} from '../domain/budget.js';
import { BudgetExhaustedError } from '../domain/errors.js';
import type { SqliteBudgetRepository } from '../persistence/budget-repo.js';
import type { EventLog } from './event-log.js';

export interface BudgetCheckResult {
  readonly allowed: boolean;
  readonly scope: BudgetScope;
  readonly scopeId: string;
  readonly remainingTokens: number;
  readonly consumptionRatio: number;
  readonly status: string;
}

export interface BudgetGuardDeps {
  readonly budgetRepo: SqliteBudgetRepository;
  readonly eventLog: EventLog;
  readonly generateId: () => string;
  readonly now: () => string;
}

/**
 * Check whether a request is allowed under all applicable budget scopes.
 *
 * Checks budgets in hierarchical order: global → pipeline → stage → agent.
 * Returns the first exhausted scope, or an allow result if all pass.
 */
export function checkBudget(
  deps: BudgetGuardDeps,
  scopes: ReadonlyArray<{ scope: BudgetScope; scopeId: string }>,
): BudgetCheckResult {
  for (const { scope, scopeId } of scopes) {
    const record = deps.budgetRepo.getByScope(scope, scopeId);
    if (!record) continue; // No budget configured for this scope -- allow

    if (isBudgetExhausted(record)) {
      return {
        allowed: false,
        scope: record.scope,
        scopeId: record.scopeId,
        remainingTokens: Math.max(0, record.limitTokens - record.consumedTokens),
        consumptionRatio:
          record.limitTokens > 0
            ? record.consumedTokens / record.limitTokens
            : 1,
        status: record.status,
      };
    }
  }

  // All scopes pass -- return the most constrained scope info
  let mostConstrained: BudgetCheckResult = {
    allowed: true,
    scope: 'global' as BudgetScope,
    scopeId: 'default',
    remainingTokens: Infinity,
    consumptionRatio: 0,
    status: BudgetStatus.Active,
  };

  for (const { scope, scopeId } of scopes) {
    const record = deps.budgetRepo.getByScope(scope, scopeId);
    if (!record) continue;
    const remaining = Math.max(0, record.limitTokens - record.consumedTokens);
    if (remaining < mostConstrained.remainingTokens) {
      mostConstrained = {
        allowed: true,
        scope: record.scope,
        scopeId: record.scopeId,
        remainingTokens: remaining,
        consumptionRatio:
          record.limitTokens > 0
            ? record.consumedTokens / record.limitTokens
            : 0,
        status: record.status,
      };
    }
  }

  return mostConstrained;
}

/**
 * Enforce budget: throw BudgetExhaustedError if any scope is exhausted.
 */
export function enforceBudget(
  deps: BudgetGuardDeps,
  scopes: ReadonlyArray<{ scope: BudgetScope; scopeId: string }>,
): BudgetCheckResult {
  const result = checkBudget(deps, scopes);
  if (!result.allowed) {
    throw new BudgetExhaustedError(
      result.scope,
      result.scopeId,
      result.remainingTokens === 0
        ? getBudgetConsumed(deps, result.scope, result.scopeId)
        : 0,
      getBudgetLimit(deps, result.scope, result.scopeId),
    );
  }
  return result;
}

function getBudgetConsumed(
  deps: BudgetGuardDeps,
  scope: BudgetScope,
  scopeId: string,
): number {
  const record = deps.budgetRepo.getByScope(scope, scopeId);
  return record?.consumedTokens ?? 0;
}

function getBudgetLimit(
  deps: BudgetGuardDeps,
  scope: BudgetScope,
  scopeId: string,
): number {
  const record = deps.budgetRepo.getByScope(scope, scopeId);
  return record?.limitTokens ?? 0;
}

/**
 * Record consumption against all applicable budget scopes.
 * Emits structured events on status transitions.
 * Returns all transitions that occurred.
 */
export function recordConsumption(
  deps: BudgetGuardDeps,
  scopes: ReadonlyArray<{ scope: BudgetScope; scopeId: string }>,
  consumption: BudgetConsumption,
  taskId: string,
  agentId: string | null,
): BudgetStatusTransition[] {
  const transitions: BudgetStatusTransition[] = [];

  for (const { scope, scopeId } of scopes) {
    const record = deps.budgetRepo.getByScope(scope, scopeId);
    if (!record) continue;

    const { status, transition } = computeBudgetStatus(record, consumption);

    deps.budgetRepo.updateConsumption(
      record.id,
      record.consumedTokens + consumption.tokens,
      record.consumedUsd + consumption.usd,
      status,
      record.rev,
      deps.now(),
    );

    if (transition) {
      transitions.push(transition);
      emitBudgetTransitionEvent(deps, transition, taskId, agentId);
    }
  }

  return transitions;
}

function emitBudgetTransitionEvent(
  deps: BudgetGuardDeps,
  transition: BudgetStatusTransition,
  taskId: string,
  agentId: string | null,
): void {
  deps.eventLog.logBudgetTransition(taskId, agentId, {
    budgetId: transition.budgetId,
    scope: transition.scope,
    scopeId: transition.scopeId,
    from: transition.from,
    to: transition.to,
    consumedTokens: transition.consumedTokens,
    limitTokens: transition.limitTokens,
    consumedUsd: transition.consumedUsd,
    limitUsd: transition.limitUsd,
  });
}

/**
 * Build the standard scope chain for a request context.
 * Order matters: global is checked first, then pipeline, stage, agent.
 */
export function buildScopeChain(context: {
  pipelineId?: string;
  stageName?: string;
  agentId?: string;
}): Array<{ scope: BudgetScope; scopeId: string }> {
  const chain: Array<{ scope: BudgetScope; scopeId: string }> = [
    { scope: 'global' as BudgetScope, scopeId: 'default' },
  ];

  if (context.pipelineId) {
    chain.push({
      scope: 'pipeline' as BudgetScope,
      scopeId: context.pipelineId,
    });
  }

  if (context.stageName) {
    chain.push({ scope: 'stage' as BudgetScope, scopeId: context.stageName });
  }

  if (context.agentId) {
    chain.push({ scope: 'agent' as BudgetScope, scopeId: context.agentId });
  }

  return chain;
}
