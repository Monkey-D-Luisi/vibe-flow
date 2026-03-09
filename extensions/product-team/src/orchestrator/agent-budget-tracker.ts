/**
 * Agent budget tracker -- per-agent token consumption tracking and enforcement.
 *
 * Bridges the budget guard (Task 0084) with the plugin lifecycle by:
 * 1. Creating agent-scope budget records for each pipeline run
 * 2. Recording consumption from after_tool_call events
 * 3. Enforcing agent-level budget limits
 */

import type { BudgetConsumption } from '../domain/budget.js';
import { createBudgetRecord, BudgetScope } from '../domain/budget.js';
import type { SqliteBudgetRepository } from '../persistence/budget-repo.js';
import {
  checkBudget,
  recordConsumption,
  buildScopeChain,
} from './budget-guard.js';
import type { BudgetGuardDeps, BudgetCheckResult } from './budget-guard.js';
import type { PricingTable } from '../domain/pricing-table.js';
import { DEFAULT_AGENT_ALLOCATIONS } from '../domain/pricing-table.js';

export interface AgentBudgetTrackerDeps {
  readonly budgetRepo: SqliteBudgetRepository;
  readonly budgetGuardDeps: BudgetGuardDeps;
  readonly pricingTable: PricingTable;
  readonly generateId: () => string;
  readonly now: () => string;
  readonly allocations: Readonly<Record<string, number>>;
}

/**
 * Extract token usage from an after_tool_call event result.
 * Looks for LLM usage metadata in the event payload.
 */
export function extractTokenUsage(event: {
  toolName: string;
  result?: unknown;
}): { inputTokens: number; outputTokens: number; model?: string; provider?: string } | null {
  const result = event.result as Record<string, unknown> | undefined;
  if (!result) return null;

  // Check for token usage in result.usage or result.details.usage
  const usage = extractUsageFromRecord(result) ?? extractUsageFromRecord(
    typeof result.details === 'object' && result.details !== null
      ? result.details as Record<string, unknown>
      : null,
  );

  return usage;
}

function extractUsageFromRecord(
  record: Record<string, unknown> | null,
): { inputTokens: number; outputTokens: number; model?: string; provider?: string } | null {
  if (!record) return null;

  const usage = record.usage as Record<string, unknown> | undefined;
  if (!usage) return null;

  const rawInput = usage.inputTokens;
  const rawOutput = usage.outputTokens;
  const inputTokens = typeof rawInput === 'number' && Number.isFinite(rawInput) && rawInput >= 0 ? rawInput : 0;
  const outputTokens = typeof rawOutput === 'number' && Number.isFinite(rawOutput) && rawOutput >= 0 ? rawOutput : 0;

  if (inputTokens === 0 && outputTokens === 0) return null;

  return {
    inputTokens,
    outputTokens,
    model: typeof usage.model === 'string' ? usage.model : undefined,
    provider: typeof usage.provider === 'string' ? usage.provider : undefined,
  };
}

/**
 * Ensure agent-scope budget records exist for a pipeline run.
 * Creates budget records based on pipeline budget allocation percentages.
 *
 * Returns the number of records created (0 if they already exist).
 */
export function ensureAgentBudgets(
  deps: AgentBudgetTrackerDeps,
  pipelineId: string,
  agentIds: readonly string[],
): number {
  const pipelineBudget = deps.budgetRepo.getByScope(BudgetScope.Pipeline, pipelineId);
  if (!pipelineBudget) return 0;

  const allocations = deps.allocations;
  let created = 0;

  for (const agentId of agentIds) {
    const scopeId = agentScopeId(pipelineId, agentId);
    const existing = deps.budgetRepo.getByScope(BudgetScope.Agent, scopeId);
    if (existing) continue;

    const share = allocations[agentId] ?? 0;
    if (share <= 0) continue;

    const limitTokens = Math.floor(pipelineBudget.limitTokens * share);
    const limitUsd = pipelineBudget.limitUsd * share;

    const record = createBudgetRecord(
      {
        scope: BudgetScope.Agent,
        scopeId,
        limitTokens,
        limitUsd: limitUsd > 0 ? limitUsd : undefined,
        warningThreshold: pipelineBudget.warningThreshold,
      },
      deps.generateId(),
      deps.now(),
    );

    deps.budgetRepo.create(record);
    created += 1;
  }

  return created;
}

/**
 * Record token consumption for an agent in a pipeline.
 * Calculates USD cost via the pricing table and records against all applicable scopes.
 */
export function trackAgentConsumption(
  deps: AgentBudgetTrackerDeps,
  agentId: string,
  pipelineId: string | undefined,
  taskId: string,
  inputTokens: number,
  outputTokens: number,
  provider?: string,
  model?: string,
): void {
  const totalTokens = inputTokens + outputTokens;
  const usd = provider && model
    ? deps.pricingTable.calculateUsd(provider, model, inputTokens, outputTokens)
    : 0;

  const consumption: BudgetConsumption = { tokens: totalTokens, usd };

  const scopeId = pipelineId ? agentScopeId(pipelineId, agentId) : agentId;
  const scopes = buildScopeChain({ pipelineId, agentId: scopeId });

  recordConsumption(deps.budgetGuardDeps, scopes, consumption, taskId, agentId);
}

/**
 * Check whether an agent has remaining budget.
 * Returns the budget check result for the agent scope.
 */
export function checkAgentBudget(
  deps: AgentBudgetTrackerDeps,
  agentId: string,
  pipelineId?: string,
): BudgetCheckResult {
  const scopeId = pipelineId ? agentScopeId(pipelineId, agentId) : agentId;
  const scopes = buildScopeChain({ pipelineId, agentId: scopeId });
  return checkBudget(deps.budgetGuardDeps, scopes);
}

/**
 * Get default allocations merged with overrides.
 */
export function resolveAllocations(
  overrides?: Readonly<Record<string, number>>,
): Record<string, number> {
  if (!overrides) return { ...DEFAULT_AGENT_ALLOCATIONS };
  return { ...DEFAULT_AGENT_ALLOCATIONS, ...overrides };
}

/**
 * Build a composite scope ID for agent-within-pipeline tracking.
 * Format: `<pipelineId>::<agentId>`
 */
export function agentScopeId(pipelineId: string, agentId: string): string {
  return `${pipelineId}::${agentId}`;
}
