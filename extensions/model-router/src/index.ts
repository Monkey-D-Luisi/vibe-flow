import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { registerProviderHealthRoute, PROVIDERS } from './provider-health.js';
import { ProviderHealthCache } from './provider-health-cache.js';
import { createModelResolver, DEFAULT_TIER_MAPPING, type ModelCandidate, type ResolverConfig, type AgentModelConfig } from './model-resolver.js';
import { DEFAULT_COST_AWARE_CONFIG } from './cost-aware-router.js';
import { getBudgetRemainingFraction } from './budget-integration.js';

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

/** Known provider IDs from the health check system. */
const KNOWN_PROVIDER_IDS = new Set(PROVIDERS.map(p => p.id));

/**
 * Classify a model ID into a ModelCandidate.
 *
 * Handles both bare IDs ('claude-opus-4') and provider-qualified IDs
 * ('anthropic/claude-opus-4-6'). When a provider prefix is present,
 * it is extracted and normalised to match health cache provider IDs.
 */

// Known provider prefix → health-cache provider ID mapping
const PROVIDER_PREFIX_MAP: ReadonlyMap<string, string> = new Map([
  ['anthropic', 'anthropic'],
  ['openai', 'openai-codex'],
  ['openai-codex', 'openai-codex'],
  ['github-copilot', 'github-copilot'],
]);

// Tier rules applied to the model portion (after stripping provider prefix)
const TIER_RULES: ReadonlyArray<{ pattern: RegExp; providerId: string; tier: ModelCandidate['tier'] }> = [
  { pattern: /^claude-opus/i, providerId: 'anthropic', tier: 'premium' },
  { pattern: /^claude-sonnet/i, providerId: 'anthropic', tier: 'standard' },
  { pattern: /^claude-haiku/i, providerId: 'anthropic', tier: 'economy' },
  { pattern: /^gpt-5/i, providerId: 'openai-codex', tier: 'premium' },
  { pattern: /^gpt-4/i, providerId: 'openai-codex', tier: 'standard' },
  { pattern: /^gpt-3/i, providerId: 'openai-codex', tier: 'economy' },
  { pattern: /^o[1-9]/i, providerId: 'openai-codex', tier: 'premium' },
  { pattern: /^copilot/i, providerId: 'github-copilot', tier: 'economy' },
];

function classifyModel(fullModelId: string): ModelCandidate {
  let providerId: string | undefined;
  let modelPart = fullModelId;

  // Split on first '/' to extract potential provider prefix
  const slashIdx = fullModelId.indexOf('/');
  if (slashIdx > 0) {
    const prefix = fullModelId.slice(0, slashIdx);
    providerId = PROVIDER_PREFIX_MAP.get(prefix);
    modelPart = fullModelId.slice(slashIdx + 1);
  }

  // Match tier rules against the model portion
  for (const rule of TIER_RULES) {
    if (rule.pattern.test(modelPart)) {
      return {
        modelId: fullModelId,
        providerId: providerId ?? rule.providerId,
        tier: rule.tier,
      };
    }
  }

  // Unrecognised model — use extracted provider or 'unknown'
  return { modelId: fullModelId, providerId: providerId ?? 'unknown', tier: 'standard' };
}

/**
 * Build a model catalog from the gateway's agents configuration.
 *
 * Agents live at `api.config.agents.list` (not `api.config.agents` directly).
 * Each agent has a `model` field that may be a string or `{ primary, fallbacks }`.
 */
function buildModelCatalog(api: OpenClawPluginApi): ReadonlyMap<string, ModelCandidate> {
  const catalog = new Map<string, ModelCandidate>();

  // Extract model IDs from agent configs via the global OpenClaw config
  // Config shape: api.config.agents.list[] (validated at runtime)
  const agents = (api.config as Record<string, unknown>)?.agents;
  const agentList = agents != null && typeof agents === 'object' && 'list' in agents
    ? (agents as Record<string, unknown>).list
    : undefined;

  if (Array.isArray(agentList)) {
    for (const agent of agentList) {
      if (agent == null || typeof agent !== 'object') continue;
      const model = (agent as Record<string, unknown>).model;

      // model may be a string or { primary, fallbacks }
      if (typeof model === 'string') {
        if (!catalog.has(model)) catalog.set(model, classifyModel(model));
      } else if (model != null && typeof model === 'object') {
        const modelObj = model as Record<string, unknown>;
        if (typeof modelObj.primary === 'string' && !catalog.has(modelObj.primary)) {
          catalog.set(modelObj.primary, classifyModel(modelObj.primary));
        }
        if (Array.isArray(modelObj.fallbacks)) {
          for (const fb of modelObj.fallbacks) {
            if (typeof fb === 'string' && !catalog.has(fb)) {
              catalog.set(fb, classifyModel(fb));
            }
          }
        }
      }
    }
  }

  return catalog;
}

/**
 * Look up the agent model config by agentId from the global config.
 */
function lookupAgentModelConfig(
  api: OpenClawPluginApi,
  agentId: string,
): AgentModelConfig | undefined {
  const agents = (api.config as Record<string, unknown>)?.agents;
  const agentList = agents != null && typeof agents === 'object' && 'list' in agents
    ? (agents as Record<string, unknown>).list
    : undefined;

  if (!Array.isArray(agentList)) return undefined;

  for (const agent of agentList) {
    if (agent == null || typeof agent !== 'object') continue;
    const a = agent as Record<string, unknown>;
    if (a.id !== agentId) continue;

    const model = a.model;
    if (typeof model === 'string') {
      return { primary: model };
    }
    if (model != null && typeof model === 'object') {
      const m = model as Record<string, unknown>;
      const primary = typeof m.primary === 'string' ? m.primary : undefined;
      if (!primary) return undefined;
      const fallbacks = Array.isArray(m.fallbacks)
        ? m.fallbacks.filter((f): f is string => typeof f === 'string')
        : undefined;
      return { primary, fallbacks };
    }
  }

  return undefined;
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
    const pluginConfig = api.pluginConfig;
    const dynamicEnabled =
      pluginConfig != null &&
      typeof pluginConfig === 'object' &&
      'dynamicRouting' in pluginConfig &&
      pluginConfig.dynamicRouting != null &&
      typeof pluginConfig.dynamicRouting === 'object' &&
      'enabled' in pluginConfig.dynamicRouting &&
      (pluginConfig.dynamicRouting as Record<string, unknown>).enabled === true;

    if (dynamicEnabled) {
      const modelCatalog = buildModelCatalog(api);

      const resolverConfig: ResolverConfig = {
        enabled: true,
        timeoutMs: 500,
        modelCatalog,
        tierMapping: { ...DEFAULT_TIER_MAPPING },
        costAwareTierConfig: { ...DEFAULT_COST_AWARE_CONFIG },
      };

      const resolveModel = createModelResolver(healthCache, resolverConfig, {
        info: (msg: string) => logger.info(msg),
        warn: (msg: string) => logger.warn(msg),
        error: (msg: string) => logger.error(msg),
      });

      api.on('before_model_resolve', (_event, ctx) => {
        const agentId = ctx.agentId ?? 'unknown';
        const agentModelConfig = lookupAgentModelConfig(api, agentId);

        // Inject per-agent budget state into resolver config (Task 0086)
        resolverConfig.budgetRemainingFraction = getBudgetRemainingFraction(agentId);

        const result = resolveModel({
          agentId,
          complexityInput: { agentRole: agentId as 'pm' | 'po' | 'tech-lead' | 'designer' | 'back-1' | 'front-1' | 'qa' | 'devops' | 'system' },
          agentModelConfig,
          correlationId: undefined,
        });

        if (result.source === 'dynamic') {
          // Only set providerOverride when the provider is a known, healthy provider ID
          if (KNOWN_PROVIDER_IDS.has(result.providerId)) {
            return { modelOverride: result.modelId, providerOverride: result.providerId };
          }
          return { modelOverride: result.modelId };
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
