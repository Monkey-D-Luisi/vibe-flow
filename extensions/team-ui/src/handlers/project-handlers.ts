import type { GatewayRequestHandlerOptions } from 'openclaw/plugin-sdk';

export function handleProjectsList({ respond }: GatewayRequestHandlerOptions): void {
  respond(true, { projects: [] });
}

export function handleProjectsAdd({ params, respond }: GatewayRequestHandlerOptions): void {
  const name = typeof params['name'] === 'string' ? params['name'] : null;
  const repo = typeof params['repo'] === 'string' ? params['repo'] : null;
  if (!name || !repo) {
    respond(false, { error: 'invalid_params', message: 'name and repo required' });
    return;
  }
  respond(true, { ok: true, name, repo });
}

export function handleProjectsRemove({ params, respond }: GatewayRequestHandlerOptions): void {
  const name = typeof params['name'] === 'string' ? params['name'] : null;
  if (!name) {
    respond(false, { error: 'invalid_params', message: 'name required' });
    return;
  }
  respond(true, { ok: true, name });
}
