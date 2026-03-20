/**
 * Matrix Effect -- Green cascading characters for spawn/despawn.
 *
 * Draws a brief (1-2s) matrix rain when an agent spawns or despawns,
 * rendered on the canvas over the agent's position.
 */

import type { Camera } from '../engine/camera.js';
import { SCALED_TILE } from '../../shared/tile-data.js';

interface MatrixColumn {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  charIndex: number;
}

interface MatrixEffect {
  readonly agentId: string;
  readonly screenX: number;
  readonly screenY: number;
  readonly columns: MatrixColumn[];
  framesLeft: number;
}

const DURATION_FRAMES = 90; // ~1.5 seconds at 60fps
const COLUMN_COUNT = 10;
const MATRIX_CHARS = '01アイウエオカキクケコ@#$%&';

const activeEffects: MatrixEffect[] = [];

/** Trigger a matrix effect at an agent's position. */
export function triggerMatrix(
  agentId: string,
  agentX: number,
  agentY: number,
  camera: Camera,
): void {
  // Remove existing effect for this agent
  const existing = activeEffects.findIndex(e => e.agentId === agentId);
  if (existing >= 0) {
    activeEffects.splice(existing, 1);
  }

  const screenX = camera.offsetX + agentX * SCALED_TILE;
  const screenY = camera.offsetY + agentY * SCALED_TILE;

  const columns: MatrixColumn[] = [];
  for (let i = 0; i < COLUMN_COUNT; i++) {
    const chars: string[] = [];
    for (let j = 0; j < 8; j++) {
      chars.push(MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]);
    }
    columns.push({
      x: screenX - SCALED_TILE / 2 + (i / COLUMN_COUNT) * SCALED_TILE * 2,
      y: screenY - SCALED_TILE - Math.random() * SCALED_TILE,
      speed: 1 + Math.random() * 2,
      chars,
      charIndex: 0,
    });
  }

  activeEffects.push({
    agentId,
    screenX,
    screenY,
    columns,
    framesLeft: DURATION_FRAMES,
  });
}

/** Draw all active matrix effects. Call during render. */
export function drawMatrixEffects(ctx: CanvasRenderingContext2D): void {
  for (let i = activeEffects.length - 1; i >= 0; i--) {
    const effect = activeEffects[i];
    effect.framesLeft--;

    if (effect.framesLeft <= 0) {
      activeEffects.splice(i, 1);
      continue;
    }

    const alpha = effect.framesLeft < 30 ? effect.framesLeft / 30 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '10px "Courier New", monospace';

    for (const col of effect.columns) {
      col.y += col.speed;
      col.charIndex = (col.charIndex + 1) % col.chars.length;

      // Draw trailing characters
      for (let j = 0; j < col.chars.length; j++) {
        const cy = col.y - j * 12;
        const charAlpha = 1 - j / col.chars.length;

        ctx.fillStyle = `rgba(0, ${Math.floor(200 + 55 * charAlpha)}, ${Math.floor(40 * charAlpha)}, ${charAlpha * alpha})`;
        const charIdx = (col.charIndex + j) % col.chars.length;
        ctx.fillText(col.chars[charIdx], col.x, cy);
      }
    }

    ctx.restore();
  }
}

/** Check if any matrix effects are active. */
export function hasActiveEffects(): boolean {
  return activeEffects.length > 0;
}
