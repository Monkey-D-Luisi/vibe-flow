import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { registerProviderHealthRoute } from './provider-health.js';

/**
 * Model Router Plugin
 *
 * Registers the GET /api/providers/health endpoint for provider connectivity
 * monitoring. Provider auth is managed by OpenClaw's native auth-profiles
 * system (token, OAuth, copilot proxy). The native agents.list[].model field
 * with { primary, fallbacks } handles static per-agent routing.
 * Dynamic per-request routing is reserved for future extension
 * (task complexity scoring, cost optimisation, provider fail-over).
 */

export default {
  id: 'model-router',
  name: 'Model Router',
  description: 'Dynamic model routing for per-agent LLM assignments',

  register(api: OpenClawPluginApi) {
    const logger = api.logger;

    registerProviderHealthRoute(api);

    // Native model routing via agents.list[].model handles static assignment.
    // Auth profiles (token, OAuth, copilot-proxy) are managed by the runtime
    // via auth-profiles.json — no custom auth logic needed here.
    //
    // This hook is reserved for future dynamic logic:
    // - Route based on task complexity
    // - Switch to cheaper models when budget is low
    // - Failover based on provider health metrics
    //
    // api.on('before_model_resolve', ({ prompt }) => {
    //   // Dynamic routing logic here
    //   return {};
    // });

    logger.info('model-router: Loaded (native routing active, dynamic routing reserved)');
  },
};
