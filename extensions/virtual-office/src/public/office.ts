/**
 * Virtual Office -- Frontend Entrypoint
 *
 * Initializes the Canvas 2D engine, creates agent entities,
 * and starts the game loop rendering the pixel-art virtual office.
 */

import { startLoop } from './engine/game-loop.js';
import { createCamera, updateCamera } from './engine/camera.js';
import { render } from './engine/renderer.js';
import { createAgent, tickAgent } from './agents/agent-entity.js';
import { AGENT_DESKS } from '../shared/tile-data.js';
import type { AgentEntity } from './agents/agent-entity.js';

// --- SSE networking (task 0131) ---
import { connectSse } from './net/sse-client.js';
import type { ServerAgentState } from './net/sse-client.js';
import { applySnapshot, applyUpdate } from './net/state-sync.js';

// --- State mapping (task 0132) ---
import { mapServerStateToEntities } from './agents/state-mapper.js';

// --- Interactivity (task 0133) ---
import { installClickHandler } from './interaction/click-handler.js';
import { showInfoPanel, hideInfoPanel } from './interaction/info-panel.js';
import { showSpeechBubble, clearSpeechBubbles } from './interaction/speech-bubble.js';
import { triggerMatrix } from './interaction/matrix-effect.js';
import { getToolLabel } from '../shared/tool-label-map.js';

// --- Dashboard (task 0139) ---
import { DashboardPanel } from './dashboard/dashboard-panel.js';

// --- Canvas setup ---

const canvas = document.getElementById('office-canvas') as HTMLCanvasElement | null;
const loading = document.getElementById('loading') as HTMLDivElement | null;

if (!canvas) {
  throw new Error('Canvas element #office-canvas not found');
}

const ctx = canvas.getContext('2d');

if (!ctx) {
  throw new Error('Canvas 2D context not available');
}

ctx.imageSmoothingEnabled = false;

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  updateCamera(camera, canvas.width, canvas.height);
}

// --- Initialize camera ---

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const camera = createCamera(canvas.width, canvas.height);

// --- Create agent entities ---

const agents: AgentEntity[] = AGENT_DESKS.map(desk =>
  createAgent(desk.id, desk.label, desk.color, desk.col, desk.row),
);

// --- Export for console debugging ---

(window as unknown as Record<string, unknown>).__officeAgents = agents;
(window as unknown as Record<string, unknown>).__officeCamera = camera;

// --- Dashboard panel (task 0139) ---

const dashboard = new DashboardPanel();

// --- Click interactivity (task 0133) ---

installClickHandler(canvas, camera, agents, (agent) => {
  if (agent) {
    showInfoPanel(agent, camera);
  } else {
    hideInfoPanel();
  }
});

// --- SSE networking (task 0131) ---

const disconnectSse = connectSse({
  onSnapshot(snapshot: ServerAgentState[]) {
    applySnapshot(agents, snapshot);
    dashboard.updateAllAgents(snapshot);
  },

  onUpdate(change) {
    const entity = agents.find(a => a.id === change.agentId);
    const prev = entity
      ? (entity as Record<string, unknown>)['_serverState'] as ServerAgentState | undefined
      : undefined;

    applyUpdate(agents, change);

    // Update dashboard
    dashboard.updateAgent(change.state);
    if (change.state.currentTool) {
      dashboard.addActivity({
        agentId: change.agentId,
        action: change.state.currentTool,
        timestamp: Date.now(),
      });
    }

    if (!entity) return;

    // Speech bubble on tool change or new tool call (same tool, different seq)
    if (change.state.currentTool &&
        (change.state.currentTool !== prev?.currentTool ||
         change.state.toolCallSeq !== prev?.toolCallSeq)) {
      const label = getToolLabel(change.state.currentTool);
      if (label) {
        showSpeechBubble(change.agentId, label);
      }
    }

    // Matrix effect on spawn
    if (change.state.status === 'spawning' && prev?.status !== 'spawning') {
      triggerMatrix(change.agentId, entity.x, entity.y, camera);
    }
  },
});

// --- Game loop ---

let tickCount = 0;

startLoop({
  update(dt: number) {
    tickCount++;
    mapServerStateToEntities(agents);
    for (const agent of agents) {
      tickAgent(agent, dt);
    }
  },

  render() {
    if (!ctx) return;
    render(ctx, camera, agents, tickCount);
  },
});

// --- Resize handling ---

window.addEventListener('resize', resizeCanvas);

// --- Cleanup on unload ---

window.addEventListener('beforeunload', () => {
  disconnectSse();
  clearSpeechBubbles();
  hideInfoPanel();
  dashboard.destroy();
});

// --- Hide loading indicator ---

if (loading) loading.style.display = 'none';
