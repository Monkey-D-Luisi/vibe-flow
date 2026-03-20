/**
 * Click Handler -- Canvas click detection for agent interaction.
 *
 * Converts canvas click coordinates to tile positions and detects
 * which agent (if any) was clicked.
 */

import type { Camera } from '../engine/camera.js';
import type { AgentEntity } from '../agents/agent-entity.js';
import { SCALED_TILE } from '../../shared/tile-data.js';

/**
 * Convert screen coordinates to tile coordinates.
 * Returns fractional tile position.
 */
export function screenToTile(
  screenX: number,
  screenY: number,
  offsetX: number,
  offsetY: number,
): { col: number; row: number } {
  return {
    col: (screenX - offsetX) / SCALED_TILE,
    row: (screenY - offsetY) / SCALED_TILE,
  };
}

/**
 * Find an agent at the given tile coordinate.
 * Uses a 1-tile hit radius.
 */
export function findAgentAtTile(
  agents: readonly AgentEntity[],
  col: number,
  row: number,
): AgentEntity | null {
  for (const agent of agents) {
    const dx = Math.abs(agent.x - col);
    const dy = Math.abs(agent.y - row);
    if (dx < 1 && dy < 1) {
      return agent;
    }
  }
  return null;
}

/**
 * Install click handler on the canvas.
 * Calls the callback with the clicked agent (or null if no agent clicked).
 */
export function installClickHandler(
  canvas: HTMLCanvasElement,
  camera: Camera,
  agents: readonly AgentEntity[],
  onAgentClick: (agent: AgentEntity | null) => void,
): () => void {
  function handleClick(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const { col, row } = screenToTile(screenX, screenY, camera.offsetX, camera.offsetY);
    const agent = findAgentAtTile(agents, col, row);
    onAgentClick(agent);
  }

  canvas.addEventListener('click', handleClick);
  return () => canvas.removeEventListener('click', handleClick);
}
