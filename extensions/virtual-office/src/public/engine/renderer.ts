/**
 * Renderer -- Canvas 2D rendering pipeline.
 *
 * Draws the tilemap, desk furniture, agent entities, and UI labels.
 */

import type { Camera } from './camera.js';
import type { AgentEntity } from '../agents/agent-entity.js';
import {
  COLS, ROWS, SCALED_TILE, TILE_COLORS,
  AGENT_DESKS, getTile,
} from '../../shared/tile-data.js';

// --- Sprite rendering (task 0130) ---
import { drawSprite } from '../agents/sprite-renderer.js';
import { AGENT_SPRITES } from '../agents/sprite-data.js';

// --- Visual effects (task 0133) ---
import { drawSpeechBubbles } from '../interaction/speech-bubble.js';
import { drawMatrixEffects } from '../interaction/matrix-effect.js';

/** Clear the entire canvas with the background color. */
function clearCanvas(ctx: CanvasRenderingContext2D, camera: Camera): void {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, camera.width, camera.height);
}

/** Draw the tile grid. */
function drawTilemap(ctx: CanvasRenderingContext2D, camera: Camera): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tileType = getTile(c, r);
      const x = camera.offsetX + c * SCALED_TILE;
      const y = camera.offsetY + r * SCALED_TILE;

      ctx.fillStyle = TILE_COLORS[tileType];
      ctx.fillRect(x, y, SCALED_TILE - 1, SCALED_TILE - 1);
    }
  }
}

/** Draw desk furniture at agent desk positions. */
function drawDesks(ctx: CanvasRenderingContext2D, camera: Camera): void {
  for (const desk of AGENT_DESKS) {
    const x = camera.offsetX + desk.col * SCALED_TILE;
    const y = camera.offsetY + desk.row * SCALED_TILE;

    // Desk surface
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(x - 4, y + SCALED_TILE + 2, SCALED_TILE + 8, SCALED_TILE / 2);

    // Monitor on desk
    ctx.fillStyle = '#2a2a4a';
    ctx.fillRect(x + 6, y + SCALED_TILE + 4, SCALED_TILE - 12, SCALED_TILE / 3 - 2);
  }
}

/** Draw meeting room table. */
function drawMeetingTable(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const tableX = camera.offsetX + 8 * SCALED_TILE;
  const tableY = camera.offsetY + 4 * SCALED_TILE;
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(tableX, tableY, 3 * SCALED_TILE, SCALED_TILE);
}

/** Draw coffee area objects. */
function drawCoffeeArea(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const x = camera.offsetX + 16 * SCALED_TILE;
  const y = camera.offsetY + 3 * SCALED_TILE + 8;
  // Coffee machine
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(x, y, SCALED_TILE - 8, SCALED_TILE - 8);
  // Cup
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x + SCALED_TILE + 4, y + 8, 12, 12);
}

/** Draw server rack blinking lights. */
function drawServerRack(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  tickCount: number,
): void {
  const baseX = camera.offsetX + 15 * SCALED_TILE;
  const baseY = camera.offsetY + 8 * SCALED_TILE;

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const x = baseX + c * SCALED_TILE + 8;
      const y = baseY + r * SCALED_TILE + 8;

      // Rack unit
      ctx.fillStyle = '#1a2a1a';
      ctx.fillRect(x - 4, y - 4, SCALED_TILE - 8, SCALED_TILE - 8);

      // Blinking LED (alternates based on tick and position)
      const ledOn = (tickCount + c + r) % 60 < 30;
      ctx.fillStyle = ledOn ? '#00ff44' : '#003300';
      ctx.fillRect(x, y, 4, 4);

      // Status LED
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(x + 8, y, 4, 4);
    }
  }
}

/** Draw an agent entity. */
function drawAgent(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  agent: AgentEntity,
  tickCount: number,
): void {
  const x = camera.offsetX + agent.x * SCALED_TILE;
  // Idle bob effect: subtle vertical oscillation
  const bobOffset = agent.fsmState === 'idle'
    ? Math.sin(tickCount * 0.05 + agent.x) * 2
    : 0;
  const y = camera.offsetY + agent.y * SCALED_TILE + bobOffset;

  // Sprite rendering (replaces colored square)
  const spriteSet = AGENT_SPRITES[agent.id];
  if (spriteSet) {
    const frames = spriteSet.frames[agent.fsmState];
    const frameIdx = agent.fsm.frameIndex % frames.length;
    const frame = frames[frameIdx];
    const scale = SCALED_TILE / 16;
    drawSprite(ctx, frame, spriteSet.palette, x, y, scale);
  } else {
    // Fallback: colored square for unknown agents
    ctx.fillStyle = agent.color;
    ctx.fillRect(x + 4, y + 4, SCALED_TILE - 8, SCALED_TILE - 8);
  }

  // Label
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.floor(SCALED_TILE / 3)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(agent.label, x + SCALED_TILE / 2, y + SCALED_TILE / 2);
}

/** Draw the title and status bar. */
function drawUI(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const gridTop = camera.offsetY;
  const gridBottom = camera.offsetY + ROWS * SCALED_TILE;

  ctx.fillStyle = '#6366f1';
  ctx.font = '16px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Virtual Office - OpenClaw', camera.width / 2, gridTop - 20);

  ctx.fillStyle = '#555';
  ctx.font = '11px "Courier New", monospace';
  ctx.fillText(
    'Click an agent for details',
    camera.width / 2,
    gridBottom + 24,
  );
}

/** Main render function. Draws everything in the correct order. */
export function render(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  agents: readonly AgentEntity[],
  tickCount: number,
): void {
  clearCanvas(ctx, camera);
  drawTilemap(ctx, camera);
  drawDesks(ctx, camera);
  drawMeetingTable(ctx, camera);
  drawCoffeeArea(ctx, camera);
  drawServerRack(ctx, camera, tickCount);

  for (const agent of agents) {
    drawAgent(ctx, camera, agent, tickCount);
  }

  // Overlay effects (after agents, before UI)
  drawSpeechBubbles(ctx);
  drawMatrixEffects(ctx);

  drawUI(ctx, camera);
}
