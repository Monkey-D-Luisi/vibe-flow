/**
 * Speech Bubble -- Floating text bubble above agents.
 *
 * Shows tool activity text above an agent that auto-dismisses after 3s.
 * Drawn on the canvas (not DOM) for integration with the render pipeline.
 */

import type { Camera } from '../engine/camera.js';
import { SCALED_TILE } from '../../shared/tile-data.js';

export interface SpeechBubble {
  readonly agentId: string;
  readonly text: string;
  /** Screen X position (set at creation). */
  readonly x: number;
  /** Screen Y position (set at creation). */
  readonly y: number;
  /** Remaining frames to display. */
  framesLeft: number;
}

const DURATION_FRAMES = 180; // ~3 seconds at 60fps
const MAX_BUBBLES = 8;

/** Active speech bubbles. */
const activeBubbles: SpeechBubble[] = [];

/** Show a speech bubble for an agent. Replaces existing bubble for same agent. */
export function showSpeechBubble(
  agentId: string,
  text: string,
  agentX: number,
  agentY: number,
  camera: Camera,
): void {
  // Remove existing bubble for this agent
  const existing = activeBubbles.findIndex(b => b.agentId === agentId);
  if (existing >= 0) {
    activeBubbles.splice(existing, 1);
  }

  // Cap total bubbles
  while (activeBubbles.length >= MAX_BUBBLES) {
    activeBubbles.shift();
  }

  activeBubbles.push({
    agentId,
    text: text.length > 20 ? text.slice(0, 18) + '..' : text,
    x: camera.offsetX + agentX * SCALED_TILE + SCALED_TILE / 2,
    y: camera.offsetY + agentY * SCALED_TILE - 12,
    framesLeft: DURATION_FRAMES,
  });
}

/** Draw all active speech bubbles. Call after agents are drawn. */
export function drawSpeechBubbles(ctx: CanvasRenderingContext2D): void {
  for (let i = activeBubbles.length - 1; i >= 0; i--) {
    const bubble = activeBubbles[i];
    bubble.framesLeft--;

    if (bubble.framesLeft <= 0) {
      activeBubbles.splice(i, 1);
      continue;
    }

    // Fade out in last 30 frames
    const alpha = bubble.framesLeft < 30 ? bubble.framesLeft / 30 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '11px "Courier New", monospace';
    const metrics = ctx.measureText(bubble.text);
    const padX = 6;
    const padY = 4;
    const w = metrics.width + padX * 2;
    const h = 16 + padY * 2;
    const bx = bubble.x - w / 2;
    const by = bubble.y - h;

    // Bubble background
    ctx.fillStyle = 'rgba(30, 30, 50, 0.9)';
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 4);
    ctx.fill();

    // Bubble border
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tail triangle
    ctx.fillStyle = 'rgba(30, 30, 50, 0.9)';
    ctx.beginPath();
    ctx.moveTo(bubble.x - 4, by + h);
    ctx.lineTo(bubble.x + 4, by + h);
    ctx.lineTo(bubble.x, by + h + 6);
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.fillStyle = '#e0e0e0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bubble.text, bubble.x, by + h / 2);

    ctx.restore();
  }
}

/** Remove all bubbles (e.g. on disconnect). */
export function clearSpeechBubbles(): void {
  activeBubbles.length = 0;
}
