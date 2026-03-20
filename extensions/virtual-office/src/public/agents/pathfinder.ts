/**
 * Pathfinder -- Simple tile-by-tile movement for agents.
 *
 * Uses horizontal-then-vertical movement with wall avoidance.
 * Not a full A* -- adequate for the small 20x12 office grid.
 *
 * @deprecated Currently unused. Agent movement is handled by linear
 * interpolation in agent-entity.ts. Kept for potential future use
 * if the office layout becomes more complex and needs pathfinding.
 */

import { isWalkable } from '../../shared/tile-data.js';

/**
 * Compute the next tile step toward a target.
 * Moves horizontally first, then vertically. Avoids walls.
 *
 * @returns The next tile position { col, row } or null if already at target.
 */
export function nextStep(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): { col: number; row: number } | null {
  const col = Math.round(fromCol);
  const row = Math.round(fromRow);
  const tCol = Math.round(toCol);
  const tRow = Math.round(toRow);

  if (col === tCol && row === tRow) return null;

  // Try horizontal first
  if (col !== tCol) {
    const nextCol = col + (tCol > col ? 1 : -1);
    if (isWalkable(nextCol, row)) {
      return { col: nextCol, row };
    }
  }

  // Then vertical
  if (row !== tRow) {
    const nextRow = row + (tRow > row ? 1 : -1);
    if (isWalkable(col, nextRow)) {
      return { col, row: nextRow };
    }
  }

  // Try the other axis if primary was blocked
  if (col !== tCol) {
    // Horizontal was blocked, try vertical detour
    if (row !== tRow) {
      const nextRow = row + (tRow > row ? 1 : -1);
      if (isWalkable(col, nextRow)) {
        return { col, row: nextRow };
      }
    }
    // Try stepping vertically even if not toward target (wall detour)
    for (const dy of [1, -1]) {
      if (isWalkable(col, row + dy)) {
        return { col, row: row + dy };
      }
    }
  }

  if (row !== tRow) {
    // Vertical was blocked, try horizontal detour
    for (const dx of [1, -1]) {
      if (isWalkable(col + dx, row)) {
        return { col: col + dx, row };
      }
    }
  }

  // Stuck (shouldn't happen in our open office layout)
  return null;
}
