/**
 * Dynamic Model Resolver
 *
 * Combines complexity scoring and provider health to select the optimal
 * model for each LLM request. Falls back to static routing on any error.
 *
 * EP10 Task 0081
 */

import { scoreComplexity, type ComplexityInput, type ComplexityScore, type ComplexityTier } from './complexity-scorer.js';
import type { ProviderHealthCache, HealthState } from './provider-health-cache.js';

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
  /** Budget remaining as a fraction [0, 1]. If < 0.2, downgrades one tier. Placeholder for EP11. */
  budgetRemainingFraction?: number;
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

/** Ordered model tier precedence (premium > standard > economy). */
const TIER_ORDER: readonly ModelTier[] = ['premium', 'standard', 'economy'];

/** Downgrade one tier in the precedence order. */
function downgradeTier(tier: ModelTier): ModelTier {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return 'economy';
  return TIER_ORDER[idx + 1];
}

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

      // 3. Budget-aware downgrade (placeholder for EP11 Task 0082)
      if (config.budgetRemainingFraction !== undefined && config.budgetRemainingFraction < 0.2) {
        desiredTier = downgradeTier(desiredTier);
      }

      // 4. Timeout check before expensive catalog search
      if (Date.now() - start > config.timeoutMs) {
        const result = staticFallback(input, correlationId, start, 'resolver timeout exceeded');
        result.complexity = complexity;
        logResolution(logger, result);
        return result;
      }

      // 5. Find a healthy model at the desired tier (or adjacent tiers)
      const resolved = findHealthyModel(healthCache, config, desiredTier, input.agentModelConfig);

      if (resolved) {
        const result: ResolveResult = {
          modelId: resolved.modelId,
          providerId: resolved.providerId,
          tier: resolved.tier,
          source: 'dynamic',
          complexity,
          reason: resolved.reason,
          correlationId,
          resolveTimeMs: Date.now() - start,
        };
        logResolution(logger, result);
        return result;
      }

      // No healthy model found at any tier — fall back to static
      const result = staticFallback(input, correlationId, start, 'no healthy model found at any tier');
      result.complexity = complexity;
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

interface FoundModel {
  modelId: string;
  providerId: string;
  tier: ModelTier;
  reason: string;
}

/**
 * Search the model catalog for a healthy model, starting at the desired tier
 * and falling through to adjacent tiers if necessary.
 */
function findHealthyModel(
  healthCache: ProviderHealthCache,
  config: ResolverConfig,
  desiredTier: ModelTier,
  agentModelConfig?: AgentModelConfig,
): FoundModel | undefined {
  // Build ordered tier search: desired first, then remaining in precedence order
  const searchOrder = [desiredTier, ...TIER_ORDER.filter(t => t !== desiredTier)];

  for (const tier of searchOrder) {
    // Check agent's configured primary model first if it matches this tier
    if (agentModelConfig?.primary) {
      const candidate = config.modelCatalog.get(agentModelConfig.primary);
      if (candidate && candidate.tier === tier && isProviderUsable(healthCache, candidate.providerId)) {
        return {
          modelId: candidate.modelId,
          providerId: candidate.providerId,
          tier: candidate.tier,
          reason: `primary model '${candidate.modelId}' at tier '${tier}' is healthy`,
        };
      }
    }

    // Check agent's configured fallback models at this tier
    if (agentModelConfig?.fallbacks) {
      for (const fallbackId of agentModelConfig.fallbacks) {
        const candidate = config.modelCatalog.get(fallbackId);
        if (candidate && candidate.tier === tier && isProviderUsable(healthCache, candidate.providerId)) {
          return {
            modelId: candidate.modelId,
            providerId: candidate.providerId,
            tier: candidate.tier,
            reason: `fallback model '${candidate.modelId}' at tier '${tier}' is healthy`,
          };
        }
      }
    }

    // Check all catalog models at this tier
    for (const [, candidate] of config.modelCatalog) {
      if (candidate.tier === tier && isProviderUsable(healthCache, candidate.providerId)) {
        return {
          modelId: candidate.modelId,
          providerId: candidate.providerId,
          tier: candidate.tier,
          reason: `catalog model '${candidate.modelId}' at tier '${tier}' is healthy`,
        };
      }
    }
  }

  return undefined;
}

/** A provider is usable if it's HEALTHY or DEGRADED (DOWN is not usable). */
function isProviderUsable(healthCache: ProviderHealthCache, providerId: string): boolean {
  const state: HealthState | undefined = healthCache.getStatus(providerId);
  // If the provider has never been checked, treat as usable (optimistic)
  if (!state) return true;
  return state.status !== 'DOWN';
}

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
  const msg = `model-resolver: [${result.correlationId}] ${result.source} → ${result.modelId} (tier=${result.tier}, provider=${result.providerId}, ${result.resolveTimeMs}ms) reason: ${result.reason}`;
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
