/**
 * Camera -- Viewport management for the tile grid.
 *
 * Centers the office grid on the canvas and handles resize events.
 */

import { COLS, ROWS, SCALED_TILE } from '../../shared/tile-data.js';

export interface Camera {
  /** Pixel offset from left edge of canvas to grid origin. */
  offsetX: number;
  /** Pixel offset from top edge of canvas to grid origin. */
  offsetY: number;
  /** Canvas width in pixels. */
  width: number;
  /** Canvas height in pixels. */
  height: number;
}

/** Create a camera centered on the given canvas dimensions. */
export function createCamera(canvasWidth: number, canvasHeight: number): Camera {
  return {
    offsetX: Math.floor((canvasWidth - COLS * SCALED_TILE) / 2),
    offsetY: Math.floor((canvasHeight - ROWS * SCALED_TILE) / 2),
    width: canvasWidth,
    height: canvasHeight,
  };
}

/** Update camera after canvas resize. */
export function updateCamera(camera: Camera, canvasWidth: number, canvasHeight: number): void {
  camera.width = canvasWidth;
  camera.height = canvasHeight;
  camera.offsetX = Math.floor((canvasWidth - COLS * SCALED_TILE) / 2);
  camera.offsetY = Math.floor((canvasHeight - ROWS * SCALED_TILE) / 2);
}
