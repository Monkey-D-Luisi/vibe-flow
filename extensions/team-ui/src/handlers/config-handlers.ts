import type { GatewayRequestHandlerOptions } from 'openclaw/plugin-sdk';

export function createConfigGetHandler(basePath: string) {
  return function handleConfigGet({ respond }: GatewayRequestHandlerOptions): void {
    respond(true, {
      basePath,
      providers: {
        'openai-codex': { enabled: true },
        anthropic: { enabled: true },
        'github-copilot': { enabled: true },
      },
      telegram: { enabled: false },
      quality: { coverage: 80, complexity: 50 },
      budget: { perAgentPerDay: 10, perTask: 2 },
    });
  };
}

export function handleConfigUpdate({ respond }: GatewayRequestHandlerOptions): void {
  respond(false, { error: 'not_implemented', message: 'Config updates are not yet persisted. This endpoint is read-only.' });
}
