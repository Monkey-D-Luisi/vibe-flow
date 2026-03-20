/**
 * Sprite Renderer -- Draws pixel-art sprites to canvas.
 *
 * Renders sprites from palette-indexed pixel data at the specified
 * position and scale using ctx.fillRect per pixel.
 */

import type { AgentPalette } from './sprite-data.js';
import { paletteToColors } from './sprite-data.js';

const SPRITE_SIZE = 16;

/**
 * Draw a sprite frame to the canvas.
 *
 * @param ctx - Canvas 2D rendering context
 * @param frame - Uint8Array(256) with palette indices
 * @param palette - Agent color palette
 * @param x - Screen X position (top-left)
 * @param y - Screen Y position (top-left)
 * @param scale - Pixel scale factor (e.g. 3 for 48px per tile)
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  frame: Uint8Array,
  palette: AgentPalette,
  x: number,
  y: number,
  scale: number,
): void {
  const colors = paletteToColors(palette);
  const pixelSize = scale;

  for (let row = 0; row < SPRITE_SIZE; row++) {
    for (let col = 0; col < SPRITE_SIZE; col++) {
      const idx = frame[row * SPRITE_SIZE + col];
      if (idx === 0) continue; // transparent

      const color = colors[idx];
      if (!color) continue;

      ctx.fillStyle = color;
      ctx.fillRect(
        x + col * pixelSize,
        y + row * pixelSize,
        pixelSize,
        pixelSize,
      );
    }
  }
}
