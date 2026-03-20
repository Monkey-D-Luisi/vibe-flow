/**
 * Info Panel -- Overlay showing agent details when clicked.
 *
 * Creates a DOM overlay positioned near the clicked agent,
 * showing name, role, current task, pipeline stage, and tool.
 */

import type { AgentEntity } from '../agents/agent-entity.js';
import type { Camera } from '../engine/camera.js';
import type { ServerAgentState } from '../net/sse-client.js';
import { SCALED_TILE } from '../../shared/tile-data.js';

let currentPanel: HTMLDivElement | null = null;

/** Agent role labels for display. */
const ROLE_LABELS: Record<string, string> = {
  pm: 'Project Manager',
  'tech-lead': 'Tech Lead',
  po: 'Product Owner',
  designer: 'Designer',
  'back-1': 'Backend Dev',
  'front-1': 'Frontend Dev',
  qa: 'QA Engineer',
  devops: 'DevOps Engineer',
};

/** Show the info panel for an agent. */
export function showInfoPanel(agent: AgentEntity, camera: Camera): void {
  hideInfoPanel();

  const serverState = (agent as Record<string, unknown>)['_serverState'] as ServerAgentState | undefined;

  const panel = document.createElement('div');
  panel.className = 'info-panel';
  panel.style.cssText = `
    position: fixed;
    background: rgba(30, 30, 50, 0.95);
    color: #e0e0e0;
    border: 2px solid ${agent.color};
    border-radius: 8px;
    padding: 12px 16px;
    font-family: "Courier New", monospace;
    font-size: 13px;
    min-width: 200px;
    max-width: 300px;
    z-index: 100;
    pointer-events: auto;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  `;

  const role = ROLE_LABELS[agent.id] ?? agent.id;
  const status = serverState?.status ?? 'unknown';
  const tool = serverState?.currentTool ?? 'none';
  const stage = serverState?.pipelineStage ?? 'none';
  const task = serverState?.taskId ?? 'none';

  panel.innerHTML = `
    <div style="font-weight:bold; color:${agent.color}; margin-bottom:8px; font-size:15px;">
      ${agent.label} - ${role}
    </div>
    <div style="margin-bottom:4px;">Status: <span style="color:#10b981">${status}</span></div>
    <div style="margin-bottom:4px;">Stage: <span style="color:#818cf8">${stage}</span></div>
    <div style="margin-bottom:4px;">Tool: <span style="color:#fbbf24">${tool}</span></div>
    <div style="margin-bottom:4px;">Task: <span style="color:#93c5fd">${task}</span></div>
    <div style="margin-top:8px; color:#666; font-size:11px;">Click elsewhere to close</div>
  `;

  // Position near the agent
  const screenX = camera.offsetX + agent.x * SCALED_TILE + SCALED_TILE;
  const screenY = camera.offsetY + agent.y * SCALED_TILE;
  panel.style.left = `${Math.min(screenX, window.innerWidth - 320)}px`;
  panel.style.top = `${Math.max(screenY, 10)}px`;

  document.body.appendChild(panel);
  currentPanel = panel;
}

/** Hide the info panel if visible. */
export function hideInfoPanel(): void {
  if (currentPanel) {
    currentPanel.remove();
    currentPanel = null;
  }
}
