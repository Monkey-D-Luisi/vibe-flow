import type { GatewayRequestHandlerOptions } from 'openclaw/plugin-sdk';

export function handleConfigGet({ respond }: GatewayRequestHandlerOptions): void {
  respond(true, {
    basePath: '/team',
    providers: {
      openai: { enabled: true },
      anthropic: { enabled: true },
      google: { enabled: true },
    },
    telegram: { enabled: false },
    quality: { coverage: 80, complexity: 50 },
    budget: { perAgentPerDay: 10, perTask: 2 },
  });
}

export function handleConfigUpdate({ params, respond }: GatewayRequestHandlerOptions): void {
  respond(true, { ok: true, updated: Object.keys(params) });
}
