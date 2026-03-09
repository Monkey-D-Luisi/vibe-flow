/**
 * Cross-extension budget state registry.
 *
 * Provides a decoupled communication channel between the product-team budget
 * engine and the model-router. Both extensions run in the same Node.js process
 * and share state via a globalThis-backed Map keyed by a well-known symbol.
 *
 * The product-team extension publishes per-agent budget state after each
 * consumption update; the model-router reads it in the before_model_resolve
 * hook to feed budgetRemainingFraction into the cost-aware tier algorithm.
 *
 * No cross-extension import dependency is needed -- the product-team extension
 * writes to the same globalThis registry using the same symbol key.
 */

export interface AgentBudgetState {
  readonly agentId: string;
  readonly consumptionRatio: number;
  readonly status: 'active' | 'warning' | 'exhausted';
  readonly updatedAt: string;
}

/** Well-known symbol for the shared budget state registry. */
const REGISTRY_KEY = Symbol.for('openclaw:budget-state-registry');

function getRegistry(): Map<string, AgentBudgetState> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, AgentBudgetState>();
  }
  return g[REGISTRY_KEY] as Map<string, AgentBudgetState>;
}

/**
 * Publish agent budget state. Called by the product-team extension
 * after recording consumption.
 */
export function publishAgentBudgetState(state: AgentBudgetState): void {
  getRegistry().set(state.agentId, state);
}

/**
 * Get agent budget state. Called by the model-router extension
 * in the before_model_resolve hook.
 *
 * Returns undefined if no budget state has been published for this agent.
 */
export function getAgentBudgetState(agentId: string): AgentBudgetState | undefined {
  return getRegistry().get(agentId);
}

/**
 * Calculate the remaining budget fraction (0.0 to 1.0) for an agent.
 * Returns undefined if no budget state is available (fail-open: no downgrade).
 */
export function getBudgetRemainingFraction(agentId: string): number | undefined {
  const state = getRegistry().get(agentId);
  if (!state) return undefined;
  return Math.max(0, 1.0 - state.consumptionRatio);
}

/**
 * Clear all budget state. Used for testing and pipeline cleanup.
 */
export function clearBudgetStates(): void {
  getRegistry().clear();
}

/**
 * Clear budget state for a specific agent. Used when agent session ends.
 */
export function clearAgentBudgetState(agentId: string): boolean {
  return getRegistry().delete(agentId);
}

/**
 * Get all agent budget states. Used for diagnostics.
 */
export function listBudgetStates(): readonly AgentBudgetState[] {
  return [...getRegistry().values()];
}
