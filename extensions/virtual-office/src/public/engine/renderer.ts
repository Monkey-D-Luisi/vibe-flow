/**
 * Renderer -- Canvas 2D rendering pipeline.
 *
 * Draws the tilemap, desk furniture, agent entities, and UI labels.
 */

import type { Camera } from './camera.js';
import type { AgentEntity } from '../agents/agent-entity.js';
import type { ServerAgentState } from '../net/sse-client.js';
import {
  COLS, ROWS, SCALED_TILE, TILE_COLORS,
  AGENT_DESKS, getTile, TileType,
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
      ctx.fillRect(x, y, SCALED_TILE, SCALED_TILE);

      // Subtle checker pattern to recover a stronger pixel-grid feel.
      if (tileType !== TileType.WALL && (r + c) % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(x, y, SCALED_TILE, SCALED_TILE);
      }

      // Keep tile boundaries readable without changing the room layout.
      ctx.strokeStyle = 'rgba(9, 11, 24, 0.28)';
      ctx.strokeRect(x + 0.5, y + 0.5, SCALED_TILE - 1, SCALED_TILE - 1);
    }
  }
}

/** Draw desk furniture at agent desk positions. */
function drawDesks(ctx: CanvasRenderingContext2D, camera: Camera): void {
  for (const desk of AGENT_DESKS) {
    const x = camera.offsetX + desk.col * SCALED_TILE;
    const y = camera.offsetY + desk.row * SCALED_TILE;

    // Skip desk furniture if the tile immediately below would overlap with
    // the meeting room (e.g. PO desk at col 9 row 2 vs meeting room row 3).
    if (getTile(desk.col, desk.row + 1) === TileType.MEETING) continue;

    // Desk surface
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(x - 4, y + SCALED_TILE + 2, SCALED_TILE + 8, SCALED_TILE / 2);

    // Monitor on desk
    ctx.fillStyle = '#2a2a4a';
    ctx.fillRect(x + 6, y + SCALED_TILE + 4, SCALED_TILE - 12, SCALED_TILE / 3 - 2);
  }
}

/** Draw meeting room table with chairs. */
function drawMeetingTable(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const tableX = camera.offsetX + 8 * SCALED_TILE;
  const tableY = camera.offsetY + 4 * SCALED_TILE;
  ctx.fillStyle = '#5a4a3a';
  ctx.fillRect(tableX, tableY, 3 * SCALED_TILE, SCALED_TILE);

  // Chairs above table (3 chairs along cols 8-10, above row 4)
  ctx.fillStyle = '#5a5a7a';
  for (let i = 0; i < 3; i++) {
    const cx = tableX + i * SCALED_TILE + SCALED_TILE / 2 - 3;
    const cy = tableY - 10;
    ctx.fillRect(cx, cy, 6, 6);
  }

  // Chairs below table (3 chairs along cols 8-10, below row 4)
  for (let i = 0; i < 3; i++) {
    const cx = tableX + i * SCALED_TILE + SCALED_TILE / 2 - 3;
    const cy = tableY + SCALED_TILE + 4;
    ctx.fillRect(cx, cy, 6, 6);
  }
}

/** Draw coffee area objects with steam animation. */
function drawCoffeeArea(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  tickCount: number,
): void {
  const x = camera.offsetX + 16 * SCALED_TILE;
  const y = camera.offsetY + 3 * SCALED_TILE + 4;

  // Coffee machine body (taller dark rectangle)
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x + 4, y, SCALED_TILE - 16, SCALED_TILE - 4);

  // Dispensing nozzle
  ctx.fillStyle = '#222';
  ctx.fillRect(x + 10, y + SCALED_TILE - 12, 8, 4);

  // Machine top accent
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(x + 4, y, SCALED_TILE - 16, 4);

  // Cup next to machine
  ctx.fillStyle = '#d4a574';
  ctx.fillRect(x + SCALED_TILE - 4, y + SCALED_TILE - 16, 12, 12);

  // Steam particles (3 wiggly pixels rising from machine)
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const phase = tickCount * 0.08 + i * 2.1;
    const rise = (tickCount * 0.3 + i * 8) % 20;
    const wobble = Math.sin(phase) * 3;
    const alpha = 0.6 - rise * 0.03;
    if (alpha <= 0) continue;
    ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
    ctx.fillRect(
      x + SCALED_TILE / 2 - 4 + wobble + i * 4,
      y - 4 - rise,
      2, 2,
    );
  }
  ctx.restore();
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

/** Draw zone labels (subtle text over each area). */
function drawZoneLabels(ctx: CanvasRenderingContext2D, camera: Camera): void {
  ctx.save();
  ctx.font = '11px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(180, 180, 200, 0.65)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 3;

  // Meeting Room label (centered over cols 7-11, row 3)
  ctx.fillText(
    'Meeting Room',
    camera.offsetX + 9 * SCALED_TILE + SCALED_TILE / 2,
    camera.offsetY + 3 * SCALED_TILE + 4,
  );

  // Coffee label (centered over cols 15-17, row 3)
  ctx.fillText(
    'Coffee',
    camera.offsetX + 16 * SCALED_TILE + SCALED_TILE / 2,
    camera.offsetY + 2 * SCALED_TILE + SCALED_TILE - 10,
  );

  // Servers label (centered over cols 15-17, row 8)
  ctx.fillText(
    'Servers',
    camera.offsetX + 16 * SCALED_TILE + SCALED_TILE / 2,
    camera.offsetY + 7 * SCALED_TILE + SCALED_TILE - 10,
  );
  ctx.restore();
}

/** Draw decorative plant in the lower-left corner. */
function drawDecorations(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const px = camera.offsetX + 1 * SCALED_TILE + SCALED_TILE / 2;
  const py = camera.offsetY + 10 * SCALED_TILE;

  // Pot
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(px - 8, py + 12, 16, 10);
  ctx.fillRect(px - 6, py + 8, 12, 6);

  // Foliage
  ctx.fillStyle = '#2d8b46';
  ctx.fillRect(px - 10, py, 8, 10);
  ctx.fillRect(px + 2, py - 2, 8, 12);
  ctx.fillRect(px - 6, py - 6, 12, 8);
  ctx.fillStyle = '#3aad5c';
  ctx.fillRect(px - 4, py - 4, 8, 6);
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

  // Active glow indicator
  const serverState = (agent as Record<string, unknown>)['_serverState'] as ServerAgentState | undefined;
  if (serverState?.status === 'active') {
    const pulse = 0.10 + Math.sin(tickCount * 0.06) * 0.05;
    ctx.save();
    ctx.fillStyle = `rgba(99, 102, 241, ${pulse})`;
    ctx.beginPath();
    ctx.arc(x + SCALED_TILE / 2, y + SCALED_TILE / 2, SCALED_TILE / 2 + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

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

  // Label below sprite with dark pill background
  const sx = x + SCALED_TILE / 2;
  const labelY = y + SCALED_TILE + 12;
  const fontSize = Math.floor(SCALED_TILE / 3);
  ctx.font = `${fontSize}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lw = ctx.measureText(agent.label).width + 6;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(sx - lw / 2, labelY - 5, lw, 11);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(agent.label, sx, labelY);
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
  drawZoneLabels(ctx, camera);
  drawDesks(ctx, camera);
  drawMeetingTable(ctx, camera);
  drawCoffeeArea(ctx, camera, tickCount);
  drawServerRack(ctx, camera, tickCount);
  drawDecorations(ctx, camera);

  for (const agent of agents) {
    drawAgent(ctx, camera, agent, tickCount);
  }

  // Overlay effects (after agents, before UI)
  drawSpeechBubbles(ctx, agents, camera);
  drawMatrixEffects(ctx);

  drawUI(ctx, camera);
}
