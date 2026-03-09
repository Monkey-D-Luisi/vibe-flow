/**
 * Cross-extension scoring state registry.
 *
 * Provides a decoupled communication channel between the product-team
 * AgentModelScorer and the model-router. Both extensions run in the same
 * Node.js process and share state via a globalThis-backed Map keyed by
 * a well-known symbol.
 *
 * The product-team extension publishes scores after computation;
 * the model-router reads them in the before_model_resolve hook to
 * bias routing toward proven agent x model combinations.
 */

export interface ScoringRecommendation {
  readonly agentId: string;
  readonly taskType: string;
  readonly recommendedModelId: string;
  readonly score: number;
  readonly sampleSize: number;
  readonly confidence: number;
  readonly updatedAt: string;
}

/** Well-known symbol for the shared scoring state registry. */
const REGISTRY_KEY = Symbol.for('openclaw:scoring-state-registry');

function getRegistry(): Map<string, ScoringRecommendation> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, ScoringRecommendation>();
  }
  return g[REGISTRY_KEY] as Map<string, ScoringRecommendation>;
}

/**
 * Publish a scoring recommendation. Called by the product-team extension
 * after score computation.
 */
export function publishScoringRecommendation(rec: ScoringRecommendation): void {
  const key = `${rec.agentId}::${rec.taskType}`;
  getRegistry().set(key, rec);
}

/**
 * Get the scoring recommendation for an agent x taskType combo.
 * Called by the model-router extension in before_model_resolve.
 *
 * Returns undefined if no recommendation exists (fail-open: use default routing).
 */
export function getScoringRecommendation(
  agentId: string,
  taskType: string,
): ScoringRecommendation | undefined {
  const key = `${agentId}::${taskType}`;
  return getRegistry().get(key);
}

/**
 * Get all scoring recommendations. Used for diagnostics.
 */
export function listScoringRecommendations(): readonly ScoringRecommendation[] {
  return [...getRegistry().values()];
}

/**
 * Clear all scoring state. Used for testing and pipeline cleanup.
 */
export function clearScoringStates(): void {
  getRegistry().clear();
}
