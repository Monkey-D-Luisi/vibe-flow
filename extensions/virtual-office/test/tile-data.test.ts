import { describe, it, expect } from 'vitest';
import {
  COLS,
  ROWS,
  TILE_LAYOUT,
  TILE_COLORS,
  AGENT_DESKS,
  TileType,
  getTile,
  isWalkable,
} from '../src/shared/tile-data.js';

describe('Tile Data', () => {
  it('has correct grid dimensions', () => {
    expect(COLS).toBe(20);
    expect(ROWS).toBe(12);
    expect(TILE_LAYOUT).toHaveLength(COLS * ROWS);
  });

  it('border tiles are walls', () => {
    // Top row
    for (let c = 0; c < COLS; c++) {
      expect(getTile(c, 0)).toBe(TileType.WALL);
    }
    // Bottom row
    for (let c = 0; c < COLS; c++) {
      expect(getTile(c, ROWS - 1)).toBe(TileType.WALL);
    }
    // Left column
    for (let r = 0; r < ROWS; r++) {
      expect(getTile(0, r)).toBe(TileType.WALL);
    }
    // Right column
    for (let r = 0; r < ROWS; r++) {
      expect(getTile(COLS - 1, r)).toBe(TileType.WALL);
    }
  });

  it('interior tiles are not walls', () => {
    expect(getTile(1, 1)).not.toBe(TileType.WALL);
    expect(getTile(10, 5)).not.toBe(TileType.WALL);
  });

  it('meeting room zone exists at expected location', () => {
    expect(getTile(8, 3)).toBe(TileType.MEETING);
    expect(getTile(9, 4)).toBe(TileType.MEETING);
    expect(getTile(10, 5)).toBe(TileType.MEETING);
  });

  it('coffee area exists at expected location', () => {
    expect(getTile(15, 3)).toBe(TileType.COFFEE);
    expect(getTile(16, 4)).toBe(TileType.COFFEE);
  });

  it('server rack exists at expected location', () => {
    expect(getTile(15, 8)).toBe(TileType.SERVER_RACK);
    expect(getTile(16, 9)).toBe(TileType.SERVER_RACK);
  });

  it('out-of-bounds returns WALL', () => {
    expect(getTile(-1, 0)).toBe(TileType.WALL);
    expect(getTile(0, -1)).toBe(TileType.WALL);
    expect(getTile(COLS, 0)).toBe(TileType.WALL);
    expect(getTile(0, ROWS)).toBe(TileType.WALL);
  });

  it('isWalkable returns true for floor, false for wall', () => {
    expect(isWalkable(1, 1)).toBe(true);
    expect(isWalkable(0, 0)).toBe(false);
  });

  it('has 8 agent desks with unique IDs and positions', () => {
    expect(AGENT_DESKS).toHaveLength(8);
    const ids = AGENT_DESKS.map(d => d.id);
    expect(new Set(ids).size).toBe(8);
    // All desk positions should be on DESK tiles
    for (const desk of AGENT_DESKS) {
      expect(getTile(desk.col, desk.row)).toBe(TileType.DESK);
    }
  });

  it('every tile type has a color', () => {
    const types = Object.values(TileType);
    for (const t of types) {
      expect(TILE_COLORS[t]).toBeDefined();
      expect(TILE_COLORS[t]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
