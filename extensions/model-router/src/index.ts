import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { registerProviderHealthRoute } from './provider-health.js';
import { ProviderHealthCache } from './provider-health-cache.js';
import { createModelResolver, DEFAULT_TIER_MAPPING, type ModelCandidate, type ResolverConfig } from './model-resolver.js';

/**
 * Model Router Plugin
 *
 * Registers the GET /api/providers/health endpoint for provider connectivity
 * monitoring and starts a background ProviderHealthCache that tracks real-time
 * provider status, latency, and emits status-change events.
 *
 * When `pluginConfig.dynamicRouting.enabled` is true, activates the
 * `before_model_resolve` hook for per-request model routing based on
 * complexity scoring, provider health, and budget state.
 */

/**
 * Build a model catalog from the gateway's agents configuration.
 *
 * Each agent has a `model` field with `{ primary, fallbacks }`. We collect
 * all unique model IDs and classify them into tiers based on known prefixes.
 * This is a heuristic — Task 0082/0083 will refine tier assignment.
 */
function buildModelCatalog(api: OpenClawPluginApi): ReadonlyMap<string, ModelCandidate> {
  const catalog = new Map<string, ModelCandidate>();

  // Known provider/tier mappings by model ID prefix
  const tierRules: Array<{ pattern: RegExp; providerId: string; tier: ModelCandidate['tier'] }> = [
    { pattern: /^claude-opus/i, providerId: 'anthropic', tier: 'premium' },
    { pattern: /^claude-sonnet/i, providerId: 'anthropic', tier: 'standard' },
    { pattern: /^claude-haiku/i, providerId: 'anthropic', tier: 'economy' },
    { pattern: /^gpt-5/i, providerId: 'openai-codex', tier: 'premium' },
    { pattern: /^gpt-4/i, providerId: 'openai-codex', tier: 'standard' },
    { pattern: /^gpt-3/i, providerId: 'openai-codex', tier: 'economy' },
    { pattern: /^o[1-9]/i, providerId: 'openai-codex', tier: 'premium' },
    { pattern: /^copilot/i, providerId: 'github-copilot', tier: 'economy' },
  ];

  function classify(modelId: string): ModelCandidate {
    for (const rule of tierRules) {
      if (rule.pattern.test(modelId)) {
        return { modelId, providerId: rule.providerId, tier: rule.tier };
      }
    }
    // Unknown model defaults to standard tier with generic provider
    return { modelId, providerId: 'unknown', tier: 'standard' };
  }

  // Extract model IDs from agent configs via the global OpenClaw config
  const agentList = (api.config as Record<string, unknown>)?.agents as Array<Record<string, unknown>> | undefined;

  if (Array.isArray(agentList)) {
    for (const agent of agentList) {
      const model = agent.model as { primary?: string; fallbacks?: string[] } | undefined;
      if (model?.primary && !catalog.has(model.primary)) {
        catalog.set(model.primary, classify(model.primary));
      }
      if (Array.isArray(model?.fallbacks)) {
        for (const fb of model.fallbacks) {
          if (typeof fb === 'string' && !catalog.has(fb)) {
            catalog.set(fb, classify(fb));
          }
        }
      }
    }
  }

  // Ensure at least the well-known models are in the catalog
  const wellKnown = [
    { modelId: 'claude-opus-4', providerId: 'anthropic', tier: 'premium' as const },
    { modelId: 'claude-sonnet-4', providerId: 'anthropic', tier: 'standard' as const },
    { modelId: 'copilot-gpt', providerId: 'github-copilot', tier: 'economy' as const },
  ];
  for (const wk of wellKnown) {
    if (!catalog.has(wk.modelId)) {
      catalog.set(wk.modelId, wk);
    }
  }

  return catalog;
}

export default {
  id: 'model-router',
  name: 'Model Router',
  description: 'Dynamic model routing for per-agent LLM assignments',

  register(api: OpenClawPluginApi) {
    const logger = api.logger;

    registerProviderHealthRoute(api);

    // Start the provider health cache with background refresh loop.
    const healthCache = new ProviderHealthCache({
      onStatusChange: (event) => {
        logger.warn(
          `model-router: Provider '${event.providerId}' status changed: ${event.previousStatus} → ${event.newStatus} (avg latency: ${event.avgLatencyMs}ms)`,
        );
      },
    });

    healthCache.start();

    // Dynamic model routing (Task 0081)
    const pluginConfig = api.pluginConfig as { dynamicRouting?: { enabled?: boolean } } | undefined;
    const dynamicEnabled = pluginConfig?.dynamicRouting?.enabled === true;

    if (dynamicEnabled) {
      const modelCatalog = buildModelCatalog(api);

      const resolverConfig: ResolverConfig = {
        enabled: true,
        timeoutMs: 500,
        modelCatalog,
        tierMapping: { ...DEFAULT_TIER_MAPPING },
      };

      const resolveModel = createModelResolver(healthCache, resolverConfig, {
        info: (msg: string) => logger.info(msg),
        warn: (msg: string) => logger.warn(msg),
        error: (msg: string) => logger.error(msg),
      });

      api.on('before_model_resolve', (_event, ctx) => {
        const result = resolveModel({
          agentId: ctx.agentId ?? 'unknown',
          complexityInput: {},
          correlationId: undefined,
        });

        if (result.source === 'dynamic') {
          return { modelOverride: result.modelId, providerOverride: result.providerId };
        }

        // Static fallback — return undefined to let the runtime use its default
        return undefined;
      });

      logger.info(`model-router: Dynamic routing ACTIVE (catalog: ${modelCatalog.size} models)`);
    } else {
      logger.info('model-router: Loaded (health cache active, dynamic routing disabled)');
    }
  },
};
