import type { GatewayRequestHandlerOptions } from 'openclaw/plugin-sdk';

const AGENT_ROSTER = [
  { id: 'pm', name: 'Product Manager', model: 'openai/gpt-5.3', status: 'idle', costToday: 0 },
  { id: 'tech-lead', name: 'Tech Lead', model: 'anthropic/claude-opus-4.6', status: 'idle', costToday: 0 },
  { id: 'po', name: 'Product Owner', model: 'openai/gpt-4.1', status: 'idle', costToday: 0 },
  { id: 'designer', name: 'UI/UX Designer', model: 'google/gemini-3-pro', status: 'idle', costToday: 0 },
  { id: 'back-1', name: 'Senior Backend Dev', model: 'anthropic/claude-sonnet-4.6', status: 'idle', costToday: 0 },
  { id: 'back-2', name: 'Junior Backend Dev', model: 'anthropic/claude-sonnet-4.6', status: 'idle', costToday: 0 },
  { id: 'front-1', name: 'Senior Frontend Dev', model: 'anthropic/claude-sonnet-4.6', status: 'idle', costToday: 0 },
  { id: 'front-2', name: 'Junior Frontend Dev', model: 'anthropic/claude-sonnet-4.6', status: 'idle', costToday: 0 },
  { id: 'qa', name: 'QA Engineer', model: 'anthropic/claude-sonnet-4.6', status: 'idle', costToday: 0 },
  { id: 'devops', name: 'DevOps Engineer', model: 'anthropic/claude-sonnet-4.6', status: 'idle', costToday: 0 },
];

export function handleAgentsList({ respond }: GatewayRequestHandlerOptions): void {
  respond(true, { agents: AGENT_ROSTER });
}

export function handleAgentsUpdate({ params, respond }: GatewayRequestHandlerOptions): void {
  const id = typeof params['id'] === 'string' ? params['id'] : null;
  if (!id) {
    respond(false, { error: 'invalid_params', message: 'agent id required' });
    return;
  }
  respond(true, { ok: true, id });
}
