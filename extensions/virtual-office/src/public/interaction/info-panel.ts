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
import { getToolLabel } from '../../shared/tool-label-map.js';

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
    border: 2px solid #6366f1;
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
  const rawTool = serverState?.currentTool ?? null;
  const tool = getToolLabel(rawTool) || (rawTool ?? 'none');
  const rawStage = serverState?.pipelineStage ?? null;
  const stage = rawStage ? rawStage.charAt(0) + rawStage.slice(1).toLowerCase() : 'none';
  const task = serverState?.taskId ? '#' + serverState.taskId.slice(-6) : 'none';

  // Build the panel content safely using textContent (avoid innerHTML XSS)
  const header = document.createElement('div');
  header.style.cssText = 'font-weight:bold; margin-bottom:8px; font-size:15px;';
  header.style.color = agent.color;
  header.textContent = `${agent.label} - ${role}`;

  const fields = [
    { label: 'Status', value: status, color: '#10b981' },
    { label: 'Stage', value: stage, color: '#818cf8' },
    { label: 'Tool', value: tool, color: '#fbbf24' },
    { label: 'Task', value: task, color: '#93c5fd' },
  ];

  panel.appendChild(header);
  for (const f of fields) {
    const row = document.createElement('div');
    row.style.marginBottom = '4px';
    row.appendChild(document.createTextNode(`${f.label}: `));
    const span = document.createElement('span');
    span.style.color = f.color;
    span.textContent = f.value;
    row.appendChild(span);
    panel.appendChild(row);
  }

  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:8px; color:#666; font-size:11px;';
  hint.textContent = 'Click elsewhere to close';
  panel.appendChild(hint);

  // Position near the agent
  const screenX = camera.offsetX + agent.x * SCALED_TILE + SCALED_TILE;
  const screenY = camera.offsetY + agent.y * SCALED_TILE;
  panel.style.left = `${Math.min(screenX, window.innerWidth - 320)}px`;
  panel.style.top = `${Math.min(Math.max(screenY, 10), window.innerHeight - 200)}px`;

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
