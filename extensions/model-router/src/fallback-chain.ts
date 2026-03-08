/**
 * Fallback Chain Resolution
 *
 * Ordered fallback chain that tries each configured model in agent-declared
 * order, with copilot-proxy (GitHub Copilot free-tier) injected as the
 * ultimate fallback when all named candidates are exhausted.
 *
 * Pure function — reads only from the health cache, makes no network calls.
 *
 * EP10 Task 0083
 */

import type { ProviderHealthCache, HealthState } from './provider-health-cache.js';
import type { ModelCandidate, ModelTier, AgentModelConfig } from './model-resolver.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Why a candidate was skipped during fallback resolution. */
export type SkipReason = 'provider-down' | 'not-in-catalog';

/** A single attempt in the fallback resolution chain. */
export interface FallbackAttempt {
  /** Model ID that was attempted. */
  modelId: string;
  /** Provider ID for this model (undefined if not in catalog). */
  providerId: string | undefined;
  /** Whether this candidate was selected. */
  selected: boolean;
  /** Reason the candidate was skipped (undefined if selected). */
  skipReason?: SkipReason;
  /** Provider health status at decision time. */
  providerStatus?: HealthState['status'];
}

/** Level of fallback that was used. */
export type FallbackLevel = 'primary' | 'configured-fallback' | 'copilot-proxy';

/** Result of fallback chain resolution. */
export interface FallbackChainResult {
  /** The selected model, or undefined if all candidates failed. */
  model: {
    modelId: string;
    providerId: string;
    tier: ModelTier;
  } | undefined;
  /** The fallback level that provided the selected model. */
  fallbackLevel: FallbackLevel | undefined;
  /** Ordered list of all candidates attempted. */
  chain: FallbackAttempt[];
  /** Human-readable reason for the final decision. */
  reason: string;
}

/** Configuration for fallback chain resolution. */
export interface FallbackChainConfig {
  /** The copilot-proxy provider ID in the health cache. */
  copilotProxyProviderId: string;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

/** Default copilot-proxy provider ID. */
export const DEFAULT_COPILOT_PROXY_PROVIDER_ID = 'github-copilot';

const DEFAULT_FALLBACK_CHAIN_CONFIG: Readonly<FallbackChainConfig> = {
  copilotProxyProviderId: DEFAULT_COPILOT_PROXY_PROVIDER_ID,
};

/* ------------------------------------------------------------------ */
/*  Core logic                                                         */
/* ------------------------------------------------------------------ */

/** Check whether a provider is usable (HEALTHY or DEGRADED; DOWN is not). */
function isProviderUsable(healthCache: ProviderHealthCache, providerId: string): { usable: boolean; status: HealthState['status'] | undefined } {
  const state = healthCache.getStatus(providerId);
  if (!state) return { usable: true, status: undefined }; // optimistic for unchecked
  return { usable: state.status !== 'DOWN', status: state.status };
}

/** Result of trying a single model candidate. */
interface TryCandidateResult {
  attempt: FallbackAttempt;
  candidate: ModelCandidate | undefined;
}

/**
 * Try a single model candidate. Returns the attempt record and the
 * resolved candidate (if found and healthy).
 */
function tryCandidate(
  modelId: string,
  catalog: ReadonlyMap<string, ModelCandidate>,
  healthCache: ProviderHealthCache,
): TryCandidateResult {
  const candidate = catalog.get(modelId);

  if (!candidate) {
    return {
      attempt: {
        modelId,
        providerId: undefined,
        selected: false,
        skipReason: 'not-in-catalog',
      },
      candidate: undefined,
    };
  }

  const { usable, status } = isProviderUsable(healthCache, candidate.providerId);

  if (!usable) {
    return {
      attempt: {
        modelId,
        providerId: candidate.providerId,
        selected: false,
        skipReason: 'provider-down',
        providerStatus: status,
      },
      candidate: undefined,
    };
  }

  return {
    attempt: {
      modelId,
      providerId: candidate.providerId,
      selected: true,
      providerStatus: status,
    },
    candidate,
  };
}

/**
 * Collect all copilot-proxy models from the catalog that are not
 * already in the agent's configured fallback list.
 */
function getCopilotProxyModels(
  catalog: ReadonlyMap<string, ModelCandidate>,
  agentModelConfig: AgentModelConfig | undefined,
  copilotProviderId: string,
): string[] {
  const configuredIds = new Set<string>();
  if (agentModelConfig?.primary) configuredIds.add(agentModelConfig.primary);
  if (agentModelConfig?.fallbacks) {
    for (const fb of agentModelConfig.fallbacks) configuredIds.add(fb);
  }

  const copilotModels: string[] = [];
  for (const [modelId, candidate] of catalog) {
    if (candidate.providerId === copilotProviderId && !configuredIds.has(modelId)) {
      copilotModels.push(modelId);
    }
  }
  return copilotModels;
}

/**
 * Resolve the fallback chain for a model resolution request.
 *
 * Resolution order:
 * 1. Agent's primary model
 * 2. Agent's configured fallbacks (in declared order)
 * 3. Copilot-proxy models from catalog (not already tried)
 *
 * Each candidate is checked for provider health. DOWN providers are
 * skipped. Models not in the catalog are skipped. The first healthy
 * candidate wins.
 *
 * If no candidate is healthy, returns `model: undefined` with the
 * full chain of attempts for debugging.
 */
export function resolveFallbackChain(
  healthCache: ProviderHealthCache,
  catalog: ReadonlyMap<string, ModelCandidate>,
  agentModelConfig: AgentModelConfig | undefined,
  config: FallbackChainConfig = DEFAULT_FALLBACK_CHAIN_CONFIG,
): FallbackChainResult {
  const chain: FallbackAttempt[] = [];

  // 1. Try primary model
  if (agentModelConfig?.primary) {
    const { attempt, candidate } = tryCandidate(agentModelConfig.primary, catalog, healthCache);
    chain.push(attempt);

    if (candidate) {
      return {
        model: { modelId: candidate.modelId, providerId: candidate.providerId, tier: candidate.tier },
        fallbackLevel: 'primary',
        chain,
        reason: `primary model '${candidate.modelId}' is healthy`,
      };
    }
  }

  // 2. Try configured fallbacks in order
  // Note: configured copilot models are labelled 'configured-fallback', not 'copilot-proxy'.
  // The 'copilot-proxy' level is reserved for phase 3 (injected ultimate fallbacks).
  if (agentModelConfig?.fallbacks) {
    for (const fallbackId of agentModelConfig.fallbacks) {
      const { attempt, candidate } = tryCandidate(fallbackId, catalog, healthCache);
      chain.push(attempt);

      if (candidate) {
        return {
          model: { modelId: candidate.modelId, providerId: candidate.providerId, tier: candidate.tier },
          fallbackLevel: 'configured-fallback',
          chain,
          reason: `configured fallback '${candidate.modelId}' is healthy`,
        };
      }
    }
  }

  // 3. Try copilot-proxy models not already in agent config
  const copilotModels = getCopilotProxyModels(catalog, agentModelConfig, config.copilotProxyProviderId);

  for (const copilotModelId of copilotModels) {
    const { attempt, candidate } = tryCandidate(copilotModelId, catalog, healthCache);
    chain.push(attempt);

    if (candidate) {
      return {
        model: { modelId: candidate.modelId, providerId: candidate.providerId, tier: candidate.tier },
        fallbackLevel: 'copilot-proxy',
        chain,
        reason: `copilot-proxy fallback '${candidate.modelId}' is healthy (all configured models exhausted)`,
      };
    }
  }

  // 4. All candidates exhausted
  const attemptedCount = chain.length;
  const downCount = chain.filter(a => a.skipReason === 'provider-down').length;
  const notInCatalogCount = chain.filter(a => a.skipReason === 'not-in-catalog').length;

  return {
    model: undefined,
    fallbackLevel: undefined,
    chain,
    reason: `all ${attemptedCount} candidates exhausted (${downCount} provider-down, ${notInCatalogCount} not-in-catalog)`,
  };
}
