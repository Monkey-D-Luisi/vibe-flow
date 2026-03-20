import { describe, it, expect } from 'vitest';
import { SCALED_TILE } from '../src/shared/tile-data.js';

/**
 * Pure math functions extracted from click-handler for testing.
 * The actual click-handler module lives in src/public/ (DOM-dependent),
 * but the coordinate math is testable independently.
 */

function screenToTile(
  screenX: number,
  screenY: number,
  offsetX: number,
  offsetY: number,
): { col: number; row: number } {
  return {
    col: (screenX - offsetX) / SCALED_TILE,
    row: (screenY - offsetY) / SCALED_TILE,
  };
}

function findAgentAtTile(
  agents: Array<{ x: number; y: number; id: string }>,
  col: number,
  row: number,
): { x: number; y: number; id: string } | null {
  for (const agent of agents) {
    const dx = Math.abs(agent.x - col);
    const dy = Math.abs(agent.y - row);
    if (dx < 1 && dy < 1) {
      return agent;
    }
  }
  return null;
}

describe('click-handler', () => {
  it('converts screen coordinates to tile position', () => {
    const offsetX = 100;
    const offsetY = 50;
    const tile = screenToTile(
      offsetX + 3 * SCALED_TILE,
      offsetY + 5 * SCALED_TILE,
      offsetX,
      offsetY,
    );
    expect(tile.col).toBe(3);
    expect(tile.row).toBe(5);
  });

  it('handles fractional tile positions', () => {
    const tile = screenToTile(100 + SCALED_TILE * 1.5, 50 + SCALED_TILE * 2.5, 100, 50);
    expect(tile.col).toBeCloseTo(1.5, 5);
    expect(tile.row).toBeCloseTo(2.5, 5);
  });

  it('finds agent within 1-tile radius', () => {
    const agents = [
      { x: 3, y: 2, id: 'pm' },
      { x: 6, y: 6, id: 'front-1' },
    ];
    const found = findAgentAtTile(agents, 3.5, 2.3);
    expect(found).not.toBeNull();
    expect(found!.id).toBe('pm');
  });

  it('returns null when no agent at position', () => {
    const agents = [
      { x: 3, y: 2, id: 'pm' },
    ];
    const found = findAgentAtTile(agents, 10, 10);
    expect(found).toBeNull();
  });

  it('returns closest agent on exact position match', () => {
    const agents = [
      { x: 5, y: 5, id: 'qa' },
    ];
    const found = findAgentAtTile(agents, 5, 5);
    expect(found).not.toBeNull();
    expect(found!.id).toBe('qa');
  });
});
