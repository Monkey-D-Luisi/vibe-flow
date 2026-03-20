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

// --- Canvas setup ---

const canvas = document.getElementById('office-canvas') as HTMLCanvasElement;
const loading = document.getElementById('loading') as HTMLDivElement;
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

// --- Export agents for external modules (SSE state-sync, interactivity) ---

(window as unknown as Record<string, unknown>).__officeAgents = agents;
(window as unknown as Record<string, unknown>).__officeCamera = camera;

// --- Game loop ---

let tickCount = 0;

startLoop({
  update(dt: number) {
    tickCount++;
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

// --- Hide loading indicator ---

loading.style.display = 'none';
