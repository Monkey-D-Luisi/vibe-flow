/**
 * Dynamic Model Resolver
 *
 * Combines complexity scoring and provider health to select the optimal
 * model for each LLM request. Falls back to static routing on any error.
 *
 * EP10 Task 0081 + Task 0083 (fallback chain)
 */

import { scoreComplexity, type ComplexityInput, type ComplexityScore, type ComplexityTier } from './complexity-scorer.js';
import type { ProviderHealthCache } from './provider-health-cache.js';
import { applyCostAwareTier, type CostAwareTierConfig, type CostAwareTierResult } from './cost-aware-router.js';
import { resolveFallbackChain, type FallbackChainConfig, type FallbackLevel, type FallbackAttempt } from './fallback-chain.js';
import { getScoringRecommendation, type ScoringRecommendation } from './scoring-integration.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Model tier used for routing decisions. */
export type ModelTier = 'premium' | 'standard' | 'economy';

/** A single model available for routing. */
export interface ModelCandidate {
  /**
   * Model identifier — may be bare (e.g. 'claude-opus-4') or
   * provider-qualified (e.g. 'anthropic/claude-opus-4-6').
   */
  modelId: string;
  /** Provider that serves this model (must match ProviderHealthCache ids). */
  providerId: string;
  /** Tier classification for this model. */
  tier: ModelTier;
}

/** Agent model configuration matching OpenClaw agents.list[].model shape. */
export interface AgentModelConfig {
  /** Primary model identifier. */
  primary: string;
  /** Ordered fallback model identifiers. */
  fallbacks?: string[];
}

/** Input context for a single model resolution request. */
export interface ResolveInput {
  /** Agent ID making the request. */
  agentId: string;
  /** Complexity input for scoring (optional — if missing, uses defaults). */
  complexityInput?: ComplexityInput;
  /** Static agent model config (primary + fallbacks). */
  agentModelConfig?: AgentModelConfig;
  /** Task type or pipeline stage for scoring lookup (EP12 Task 0093). */
  taskType?: string;
  /** Correlation ID for structured logging. */
  correlationId?: string;
}

/** Result of model resolution. */
export interface ResolveResult {
  /** The selected model ID. */
  modelId: string;
  /** The provider serving the selected model. */
  providerId: string;
  /** The tier of the selected model. */
  tier: ModelTier;
  /** Whether the result came from dynamic routing or static fallback. */
  source: 'dynamic' | 'static-fallback';
  /** Complexity score that informed the decision (if computed). */
  complexity?: ComplexityScore;
  /** Cost-aware tier decision details (if budget tracking active). */
  costAwareTier?: CostAwareTierResult;
  /** Fallback level that provided the model (Task 0083). */
  fallbackLevel?: FallbackLevel;
  /** Full fallback chain attempted during resolution (Task 0083). */
  fallbackChain?: FallbackAttempt[];
  /** Scoring recommendation from performance scorer (EP12 Task 0093). */
  scoringRecommendation?: ScoringRecommendation;
  /** Whether the scoring recommendation overrode default routing (EP12 Task 0093). */
  scoringOverride?: boolean;
  /** Reason for the routing decision. */
  reason: string;
  /** Correlation ID for tracing. */
  correlationId: string;
  /** Time taken to resolve in ms. */
  resolveTimeMs: number;
}

/** Logger interface for structured logging (subset of OpenClaw logger). */
export interface ResolverLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Configuration for the model resolver. */
export interface ResolverConfig {
  /** Whether dynamic routing is enabled. When false, always returns static routing. */
  enabled: boolean;
  /** Maximum time allowed for resolution in ms. Exceeding this falls back to static routing. */
  timeoutMs: number;
  /** Mapping from model ID to its candidate info, used to look up provider and tier. */
  modelCatalog: ReadonlyMap<string, ModelCandidate>;
  /** Mapping from complexity tier to preferred model tier. */
  tierMapping: Record<ComplexityTier, ModelTier>;
  /**
   * Budget remaining as a normalized fraction [0, 1], used by cost-aware tier routing.
   * When provided, this value is passed to applyCostAwareTier(), which may downgrade
   * the selected model tier according to the active costAwareTierConfig (or its defaults).
   */
  budgetRemainingFraction?: number;
  /** Cost-aware tier config controlling multi-threshold downgrade behavior. */
  costAwareTierConfig?: CostAwareTierConfig;
  /** Fallback chain config (copilot-proxy provider ID, etc.). Task 0083. */
  fallbackChainConfig?: FallbackChainConfig;
  /** Enable performance scoring feedback loop (EP12 Task 0093). */
  scoringFeedbackEnabled?: boolean;
  /** Minimum confidence for scoring to override routing (default 0.7). */
  scoringMinConfidence?: number;
  /** Minimum sample size for scoring to override routing (default 5). */
  scoringMinSampleSize?: number;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

/** Default tier mapping: complexity tier → model tier. */
export const DEFAULT_TIER_MAPPING: Readonly<Record<ComplexityTier, ModelTier>> = {
  low: 'economy',
  medium: 'standard',
  high: 'premium',
};

/* ------------------------------------------------------------------ */
/*  Resolver                                                           */
/* ------------------------------------------------------------------ */

/**
 * Create a model resolver function bound to health cache and config.
 *
 * Returns a `resolveModel` function that can be called per-request. The
 * resolver is pure in terms of not making network calls — it reads only
 * from the health cache and the complexity scorer.
 */
export function createModelResolver(
  healthCache: ProviderHealthCache,
  config: ResolverConfig,
  logger?: ResolverLogger,
): (input: ResolveInput) => ResolveResult {
  return (input: ResolveInput): ResolveResult => {
    const start = Date.now();
    const correlationId = input.correlationId ?? generateCorrelationId();

    // If dynamic routing is disabled, return static fallback immediately
    if (!config.enabled) {
      const result = staticFallback(input, correlationId, start, 'dynamic routing disabled');
      logResolution(logger, result);
      return result;
    }

    try {
      // 1. Compute complexity score
      const complexity = scoreComplexity(input.complexityInput ?? {});

      // 2. Determine desired model tier
      let desiredTier = config.tierMapping[complexity.tier];

      // 3. Cost-aware tier adjustment (Task 0082)
      const costResult = applyCostAwareTier({
        desiredTier,
        budgetRemainingFraction: config.budgetRemainingFraction,
        complexityScore: complexity.score,
      }, config.costAwareTierConfig);
      desiredTier = costResult.tier;

      // 3b. Performance scoring feedback loop (EP12 Task 0093)
      let scoringRec: ScoringRecommendation | undefined;
      let scoringOverride = false;
      let scoredCandidateForOverride: ModelCandidate | undefined;
      if (config.scoringFeedbackEnabled && input.taskType) {
        scoringRec = getScoringRecommendation(input.agentId, input.taskType);
        if (scoringRec) {
          const minConf = config.scoringMinConfidence ?? 0.7;
          const minSamples = config.scoringMinSampleSize ?? 5;
          if (scoringRec.confidence >= minConf && scoringRec.sampleSize >= minSamples) {
            scoredCandidateForOverride = config.modelCatalog.get(scoringRec.recommendedModelId);
            if (scoredCandidateForOverride) {
              const health = healthCache.getStatus(scoredCandidateForOverride.providerId);
              if (health?.status !== 'DOWN') {
                scoringOverride = true;
                logger?.info(
                  `model-resolver: [${correlationId}] scoring override → ${scoringRec.recommendedModelId}` +
                  ` (score=${scoringRec.score}, confidence=${scoringRec.confidence}, samples=${scoringRec.sampleSize})`,
                );
              }
            }
          }
        }
      }

      // 4. Timeout check before expensive operations
      if (Date.now() - start > config.timeoutMs) {
        const result = staticFallback(input, correlationId, start, 'resolver timeout exceeded');
        result.complexity = complexity;
        logResolution(logger, result);
        return result;
      }

      // 5. If scoring override is active, return the scored model directly
      if (scoringOverride && scoredCandidateForOverride && scoringRec) {
        const result: ResolveResult = {
          modelId: scoredCandidateForOverride.modelId,
          providerId: scoredCandidateForOverride.providerId,
          tier: scoredCandidateForOverride.tier,
          source: 'dynamic',
          complexity,
          costAwareTier: costResult.budgetSnapshot !== undefined ? costResult : undefined,
          scoringRecommendation: scoringRec,
          scoringOverride: true,
          reason: `scoring override: ${scoringRec.recommendedModelId} (score=${scoringRec.score}, confidence=${scoringRec.confidence})`,
          correlationId,
          resolveTimeMs: Date.now() - start,
        };
        logResolution(logger, result);
        return result;
      }

      // 6. Resolve via ordered fallback chain (Task 0083)
      const chainResult = resolveFallbackChain(
        healthCache,
        config.modelCatalog,
        input.agentModelConfig,
        config.fallbackChainConfig,
      );

      if (chainResult.model) {
        const result: ResolveResult = {
          modelId: chainResult.model.modelId,
          providerId: chainResult.model.providerId,
          tier: chainResult.model.tier,
          source: 'dynamic',
          complexity,
          costAwareTier: costResult.budgetSnapshot !== undefined ? costResult : undefined,
          fallbackLevel: chainResult.fallbackLevel,
          fallbackChain: chainResult.chain,
          scoringRecommendation: scoringRec,
          scoringOverride: false,
          reason: chainResult.reason,
          correlationId,
          resolveTimeMs: Date.now() - start,
        };
        logResolution(logger, result);
        return result;
      }

      // No healthy model found — structured failure with chain details
      const result = staticFallback(input, correlationId, start, chainResult.reason);
      result.complexity = complexity;
      result.fallbackChain = chainResult.chain;
      logResolution(logger, result);
      return result;
    } catch (err: unknown) {
      // Any error → static fallback
      const message = err instanceof Error ? err.message : String(err);
      const result = staticFallback(input, correlationId, start, `resolver error: ${message}`);
      logResolution(logger, result);
      return result;
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

/** Build a static fallback result when dynamic routing cannot resolve. */
function staticFallback(
  input: ResolveInput,
  correlationId: string,
  startTime: number,
  reason: string,
): ResolveResult {
  const modelId = input.agentModelConfig?.primary ?? 'unknown';
  return {
    modelId,
    providerId: 'static',
    tier: 'standard',
    source: 'static-fallback',
    reason,
    correlationId,
    resolveTimeMs: Date.now() - startTime,
  };
}

/** Log resolution decision to structured logger. */
function logResolution(logger: ResolverLogger | undefined, result: ResolveResult): void {
  if (!logger) return;
  const costInfo = (result.costAwareTier && result.costAwareTier.budgetSnapshot !== undefined)
    ? ` budget=${(result.costAwareTier.budgetSnapshot * 100).toFixed(1)}% downgraded=${result.costAwareTier.downgraded} override=${result.costAwareTier.highComplexityOverride}`
    : '';
  const fallbackInfo = result.fallbackLevel ? ` fallback=${result.fallbackLevel}` : '';
  const chainInfo = result.fallbackChain
    ? ` chain=[${result.fallbackChain.map(a => `${a.modelId}:${a.selected ? 'OK' : a.skipReason}`).join(',')}]`
    : '';
  const scoringInfo = result.scoringRecommendation
    ? ` scoring=${result.scoringRecommendation.recommendedModelId}(s=${result.scoringRecommendation.score},c=${result.scoringRecommendation.confidence})${result.scoringOverride ? ' [OVERRIDE]' : ''}`
    : '';
  const msg = `model-resolver: [${result.correlationId}] ${result.source} → ${result.modelId} (tier=${result.tier}, provider=${result.providerId}, ${result.resolveTimeMs}ms)${costInfo}${fallbackInfo}${chainInfo}${scoringInfo} reason: ${result.reason}`;
  if (result.source === 'static-fallback') {
    logger.warn(msg);
  } else {
    logger.info(msg);
  }
}

/** Generate a simple correlation ID. */
function generateCorrelationId(): string {
  return `mr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
