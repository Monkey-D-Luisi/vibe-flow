/**
 * State Sync -- Reconciles server state updates with local agent entities.
 *
 * Receives SSE events and applies them to the agent entities
 * managed by the game engine (office.ts).
 */

import type { AgentEntity } from '../agents/agent-entity.js';
import type { ServerAgentState, ServerStateChange } from './sse-client.js';

/** Apply a full snapshot to the agent entity array. */
export function applySnapshot(
  agents: AgentEntity[],
  snapshot: ServerAgentState[],
): void {
  for (const serverState of snapshot) {
    const entity = agents.find(a => a.id === serverState.agentId);
    if (!entity) continue;
    applyStateToEntity(entity, serverState);
  }
}

/** Apply an incremental state change to the matching agent entity. */
export function applyUpdate(
  agents: AgentEntity[],
  change: ServerStateChange,
): void {
  const entity = agents.find(a => a.id === change.agentId);
  if (!entity) return;
  applyStateToEntity(entity, change.state);
}

/** Apply a server state to a local entity. */
function applyStateToEntity(
  entity: AgentEntity,
  state: ServerAgentState,
): void {
  // Store server state for use by state-mapper (task 0132)
  (entity as Record<string, unknown>)['_serverState'] = state;
}
