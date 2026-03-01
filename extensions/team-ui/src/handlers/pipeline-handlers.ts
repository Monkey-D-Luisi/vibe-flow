import type { GatewayRequestHandlerOptions } from 'openclaw/plugin-sdk';

export function handlePipelineStatus({ respond }: GatewayRequestHandlerOptions): void {
  respond(true, {
    tasks: [],
    stages: ['backlog', 'grooming', 'design', 'in_progress', 'in_review', 'qa', 'done'],
  });
}

export function handleCostsSummary({ respond }: GatewayRequestHandlerOptions): void {
  respond(true, { totalToday: 0, byAgent: {}, byProvider: {} });
}

export function handleEventsStream({ respond }: GatewayRequestHandlerOptions): void {
  respond(true, { events: [] });
}

export function handleProvidersStatus({ respond }: GatewayRequestHandlerOptions): void {
  respond(true, {
    providers: [
      { id: 'openai', name: 'OpenAI', status: 'unknown' },
      { id: 'anthropic', name: 'Anthropic', status: 'unknown' },
      { id: 'google', name: 'Google AI', status: 'unknown' },
    ],
  });
}

export function handleDecisionsList({ respond }: GatewayRequestHandlerOptions): void {
  respond(true, { decisions: [] });
}
