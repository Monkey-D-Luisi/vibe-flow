import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { registerProviderHealthRoute } from './provider-health.js';
import { ProviderHealthCache } from './provider-health-cache.js';

/**
 * Model Router Plugin
 *
 * Registers the GET /api/providers/health endpoint for provider connectivity
 * monitoring and starts a background ProviderHealthCache that tracks real-time
 * provider status, latency, and emits status-change events.
 *
 * Provider auth is managed by OpenClaw's native auth-profiles system (token,
 * OAuth, copilot proxy). The native agents.list[].model field with
 * { primary, fallbacks } handles static per-agent routing. Dynamic per-request
 * routing is reserved for future extension (Task 0081+).
 */

export default {
  id: 'model-router',
  name: 'Model Router',
  description: 'Dynamic model routing for per-agent LLM assignments',

  register(api: OpenClawPluginApi) {
    const logger = api.logger;

    registerProviderHealthRoute(api);

    // Start the provider health cache with background refresh loop.
    // Status change events are logged for observability; downstream consumers
    // (model resolver, alerting) will subscribe in later tasks.
    const healthCache = new ProviderHealthCache({
      onStatusChange: (event) => {
        logger.warn(
          `model-router: Provider '${event.providerId}' status changed: ` +
          `${event.previousStatus} → ${event.newStatus} (avg latency: ${event.avgLatencyMs}ms)`,
        );
      },
    });

    healthCache.start();

    // Native model routing via agents.list[].model handles static assignment.
    // Auth profiles (token, OAuth, copilot-proxy) are managed by the runtime
    // via auth-profiles.json — no custom auth logic needed here.
    //
    // This hook is reserved for future dynamic logic:
    // - Route based on task complexity (Task 0079 ✓)
    // - Provider health-aware failover (Task 0080 ✓ — cache active)
    // - Dynamic model resolver (Task 0081)
    // - Cost-aware tier downgrade (Task 0082)
    // - Fallback chain with copilot-proxy (Task 0083)
    //
    // api.on('before_model_resolve', ({ prompt }) => {
    //   // Dynamic routing logic here — will use healthCache + complexityScorer
    //   return {};
    // });

    logger.info('model-router: Loaded (health cache active, dynamic routing reserved)');
  },
};
