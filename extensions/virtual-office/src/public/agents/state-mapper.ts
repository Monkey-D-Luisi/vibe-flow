/**
 * State Mapper -- Maps server-side agent state to entity behavior.
 *
 * Reads _serverState from entities (set by state-sync.ts) and applies
 * target positions and FSM transitions based on pipeline stage and tool activity.
 */

import type { AgentEntity } from './agent-entity.js';
import { setTarget, setAgentState } from './agent-entity.js';
import { getStageLocation } from '../../shared/stage-location-map.js';
import { getToolAction } from '../../shared/tool-action-map.js';
import type { ServerAgentState } from '../net/sse-client.js';

/**
 * Apply server state to all agent entities.
 * Called each frame (or on state change) to update targets and animations.
 */
export function mapServerStateToEntities(agents: AgentEntity[]): void {
  for (const agent of agents) {
    const serverState = (agent as Record<string, unknown>)['_serverState'] as ServerAgentState | undefined;
    if (!serverState) continue;
    mapSingleAgent(agent, serverState);
  }
}

/** Map a single agent's server state to entity behavior. */
function mapSingleAgent(agent: AgentEntity, state: ServerAgentState): void {
  if (state.status === 'offline') {
    setAgentState(agent, 'idle');
    return;
  }

  if (state.status === 'spawning') {
    // During spawn, agent stays at desk but in idle (matrix effect handled by interaction layer)
    setAgentState(agent, 'idle');
    return;
  }

  // Determine target location from pipeline stage
  if (state.pipelineStage) {
    const loc = getStageLocation(state.pipelineStage, agent.homeX, agent.homeY);
    setTarget(agent, loc.col, loc.row);

    // If agent is at target (not walking), set the activity
    const atTarget = Math.abs(agent.x - loc.col) < 0.1 && Math.abs(agent.y - loc.row) < 0.1;
    if (atTarget) {
      // Tool activity overrides stage activity
      if (state.currentTool) {
        const toolState = getToolAction(state.currentTool);
        setAgentState(agent, toolState);
      } else {
        setAgentState(agent, loc.activity);
      }
    }
    // else: walking animation is handled by tickAgent
  } else if (state.status === 'active') {
    // Active but no pipeline stage -- stay at desk with tool action
    const toolState = getToolAction(state.currentTool);
    setAgentState(agent, toolState);
  } else {
    // Idle -- go home
    setTarget(agent, agent.homeX, agent.homeY);
    const atHome = Math.abs(agent.x - agent.homeX) < 0.1 && Math.abs(agent.y - agent.homeY) < 0.1;
    if (atHome) {
      setAgentState(agent, 'idle');
    }
  }
}
