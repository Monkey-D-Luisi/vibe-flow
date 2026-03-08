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
  consumptionRatio as domainConsumptionRatio,
  computeBudgetStatus,
  isBudgetExhausted,
  remainingTokens as domainRemainingTokens,
  BudgetScope as Scope,
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
  readonly consumedTokens: number;
  readonly limitTokens: number;
  readonly consumptionRatio: number;
  readonly status: BudgetStatus;
}

export interface BudgetGuardDeps {
  readonly budgetRepo: SqliteBudgetRepository;
  readonly eventLog: EventLog;
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
        remainingTokens: domainRemainingTokens(record),
        consumedTokens: record.consumedTokens,
        limitTokens: record.limitTokens,
        consumptionRatio: domainConsumptionRatio(record),
        status: record.status,
      };
    }
  }

  // All scopes pass -- return the most constrained scope info
  let mostConstrained: BudgetCheckResult = {
    allowed: true,
    scope: Scope.Global,
    scopeId: 'default',
    remainingTokens: Infinity,
    consumedTokens: 0,
    limitTokens: 0,
    consumptionRatio: 0,
    status: BudgetStatus.Active,
  };

  for (const { scope, scopeId } of scopes) {
    const record = deps.budgetRepo.getByScope(scope, scopeId);
    if (!record) continue;
    const remaining = domainRemainingTokens(record);
    if (remaining < mostConstrained.remainingTokens) {
      mostConstrained = {
        allowed: true,
        scope: record.scope,
        scopeId: record.scopeId,
        remainingTokens: remaining,
        consumedTokens: record.consumedTokens,
        limitTokens: record.limitTokens,
        consumptionRatio: domainConsumptionRatio(record),
        status: record.status,
      };
    }
  }

  return mostConstrained;
}

/**
 * Enforce budget: throw BudgetExhaustedError if any scope is exhausted.
 * Uses data from the initial check to avoid re-querying the DB (no TOCTOU).
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
      result.consumedTokens,
      result.limitTokens,
    );
  }
  return result;
}

/**
 * Record consumption against all applicable budget scopes atomically.
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
  return deps.budgetRepo.withTransaction(() => {
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
  });
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
    { scope: Scope.Global, scopeId: 'default' },
  ];

  if (context.pipelineId) {
    chain.push({ scope: Scope.Pipeline, scopeId: context.pipelineId });
  }

  if (context.stageName) {
    chain.push({ scope: Scope.Stage, scopeId: context.stageName });
  }

  if (context.agentId) {
    chain.push({ scope: Scope.Agent, scopeId: context.agentId });
  }

  return chain;
}
