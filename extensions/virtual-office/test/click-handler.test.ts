import { describe, it, expect } from 'vitest';
import { screenToTile, findAgentAtTile } from '../src/public/interaction/click-handler.js';

describe('click-handler', () => {
  it('converts screen coordinates to tile position', () => {
    const offsetX = 100;
    const offsetY = 50;
    // SCALED_TILE = 48 (from tile-data)
    const tile = screenToTile(
      offsetX + 3 * 48,
      offsetY + 5 * 48,
      offsetX,
      offsetY,
    );
    expect(tile.col).toBe(3);
    expect(tile.row).toBe(5);
  });

  it('handles fractional tile positions', () => {
    const tile = screenToTile(100 + 48 * 1.5, 50 + 48 * 2.5, 100, 50);
    expect(tile.col).toBeCloseTo(1.5, 5);
    expect(tile.row).toBeCloseTo(2.5, 5);
  });

  it('finds agent within 1-tile radius', () => {
    const agents = [
      { x: 3, y: 2, id: 'pm' },
      { x: 6, y: 6, id: 'front-1' },
    ] as Parameters<typeof findAgentAtTile>[0];
    const found = findAgentAtTile(agents, 3.5, 2.3);
    expect(found).not.toBeNull();
    expect(found!.id).toBe('pm');
  });

  it('returns null when no agent at position', () => {
    const agents = [
      { x: 3, y: 2, id: 'pm' },
    ] as Parameters<typeof findAgentAtTile>[0];
    const found = findAgentAtTile(agents, 10, 10);
    expect(found).toBeNull();
  });

  it('returns closest agent on exact position match', () => {
    const agents = [
      { x: 5, y: 5, id: 'qa' },
    ] as Parameters<typeof findAgentAtTile>[0];
    const found = findAgentAtTile(agents, 5, 5);
    expect(found).not.toBeNull();
    expect(found!.id).toBe('qa');
  });
});
