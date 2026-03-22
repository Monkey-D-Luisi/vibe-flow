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
import {
  deriveAgentDisplayState,
  type ConnectionState,
  ROLE_LABELS,
} from '../state/display-state.js';

let currentPanel: HTMLDivElement | null = null;
let currentAgent: AgentEntity | null = null;
let currentCamera: Camera | null = null;
let currentConnectionState: ConnectionState = 'connecting';
let refreshTimer: number | null = null;

/** Show the info panel for an agent. */
export function showInfoPanel(agent: AgentEntity, camera: Camera): void {
  hideInfoPanel();

  currentAgent = agent;
  currentCamera = camera;

  const panel = document.createElement('div');
  currentPanel = panel;
  document.body.appendChild(panel);
  renderInfoPanel();
  refreshTimer = window.setInterval(() => renderInfoPanel(), 1000);
}

export function setInfoPanelConnectionState(connectionState: ConnectionState): void {
  currentConnectionState = connectionState;
  renderInfoPanel();
}

function renderInfoPanel(): void {
  if (!currentPanel || !currentAgent || !currentCamera) return;

  const serverState = (currentAgent as Record<string, unknown>)['_serverState'] as ServerAgentState | undefined;
  const fallbackState: ServerAgentState = serverState ?? {
    agentId: currentAgent.id,
    status: 'offline',
    currentTool: null,
    pipelineStage: null,
    taskId: null,
    lastSeenAt: 0,
    toolCallSeq: 0,
  };
  const display = deriveAgentDisplayState(fallbackState, Date.now(), currentConnectionState);

  currentPanel.className = 'info-panel';
  currentPanel.style.cssText = `
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

  currentPanel.replaceChildren();

  // Build the panel content safely using textContent (avoid innerHTML XSS)
  const header = document.createElement('div');
  header.style.cssText = 'font-weight:bold; margin-bottom:8px; font-size:15px;';
  header.style.color = currentAgent.color;
  header.textContent = `${currentAgent.label} - ${ROLE_LABELS[currentAgent.id] ?? currentAgent.id}`;

  const badgeRow = document.createElement('div');
  badgeRow.style.cssText = 'display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;';
  badgeRow.appendChild(createBadge(display.statusLabel, badgeColor(display.statusTone)));
  badgeRow.appendChild(createBadge(display.freshness.badge, badgeColor(display.freshness.tone)));

  const fields = [
    { label: 'Current status', value: display.statusLabel, color: '#10b981', title: null },
    { label: 'Current activity', value: display.activityLabel, color: '#fbbf24', title: null },
    { label: 'Pipeline context', value: display.pipelineLabel, color: '#818cf8', title: display.taskFull },
    { label: 'Task reference', value: display.taskLabel, color: '#93c5fd', title: display.taskFull },
    { label: 'Last update', value: display.freshness.detail, color: '#9ca3af', title: null },
  ];

  currentPanel.appendChild(header);
  currentPanel.appendChild(badgeRow);
  for (const f of fields) {
    const row = document.createElement('div');
    row.style.marginBottom = '4px';
    row.appendChild(document.createTextNode(`${f.label}: `));
    const span = document.createElement('span');
    span.style.color = f.color;
    span.textContent = f.value;
    if (f.title) span.title = f.title;
    row.appendChild(span);
    currentPanel.appendChild(row);
  }

  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:8px; color:#666; font-size:11px;';
  hint.textContent = currentConnectionState === 'disconnected'
    ? 'Connection lost · showing last known state'
    : 'Click elsewhere to close';
  currentPanel.appendChild(hint);

  // Position near the agent
  const screenX = currentCamera.offsetX + currentAgent.x * SCALED_TILE + SCALED_TILE;
  const screenY = currentCamera.offsetY + currentAgent.y * SCALED_TILE;
  currentPanel.style.left = `${Math.min(screenX, window.innerWidth - 320)}px`;
  currentPanel.style.top = `${Math.min(Math.max(screenY, 10), window.innerHeight - 240)}px`;
}

/** Hide the info panel if visible. */
export function hideInfoPanel(): void {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (currentPanel) {
    currentPanel.remove();
    currentPanel = null;
  }
  currentAgent = null;
  currentCamera = null;
}

function createBadge(label: string, background: string): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.style.cssText = `background:${background}; color:#fff; border-radius:999px; padding:2px 8px; font-size:11px; font-weight:bold;`;
  badge.textContent = label;
  return badge;
}

function badgeColor(tone: 'busy' | 'idle' | 'offline' | 'live' | 'recent' | 'stale' | 'connecting'): string {
  switch (tone) {
    case 'busy': return '#10b981';
    case 'idle': return '#6b7280';
    case 'offline': return '#ef4444';
    case 'live': return '#10b981';
    case 'recent': return '#f59e0b';
    case 'stale': return '#7c3aed';
    case 'connecting': return '#3b82f6';
  }
}
