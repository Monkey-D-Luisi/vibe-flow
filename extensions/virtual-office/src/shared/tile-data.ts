/**
 * Tile Data -- Office layout definition.
 *
 * Pure logic, no DOM dependency. Defines the 20x12 tile grid with
 * zone types and agent desk positions.
 */

/** Tile type constants. */
export const TileType = {
  WALL: 0,
  FLOOR: 1,
  DESK: 2,
  MEETING: 3,
  COFFEE: 4,
  SERVER_RACK: 5,
} as const;

export type TileTypeValue = typeof TileType[keyof typeof TileType];

/** Grid dimensions. */
export const COLS = 20;
export const ROWS = 12;

/** Tile size in pixels (before zoom). */
export const TILE_SIZE = 16;

/** Zoom factor for rendering. */
export const ZOOM = 3;

/** Scaled tile size on screen. */
export const SCALED_TILE = TILE_SIZE * ZOOM;

/**
 * 20x12 office layout. Row-major flat array.
 *
 * Layout key:
 *   0 = wall (border)
 *   1 = floor
 *   2 = desk area
 *   3 = meeting room (cols 7-11, rows 4-6)
 *   4 = coffee area (cols 15-17, rows 3-4)
 *   5 = server rack (cols 15-17, rows 8-9)
 */
// prettier-ignore
export const TILE_LAYOUT: readonly TileTypeValue[] = [
  // Row 0: top wall
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
  // Row 1: floor
  0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
  // Row 2: desks (pm, tl, po, designer)
  0,1,1,2,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,0,
  // Row 3: floor + coffee start
  0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4,4,4,1,0,
  // Row 4: floor + meeting room start + coffee
  0,1,1,1,1,1,1,3,3,3,3,3,1,1,1,4,4,4,1,0,
  // Row 5: floor + meeting room
  0,1,1,1,1,1,1,3,3,3,3,3,1,1,1,1,1,1,1,0,
  // Row 6: floor + meeting room end
  0,1,1,1,1,1,1,3,3,3,3,3,1,1,1,1,1,1,1,0,
  // Row 7: desks (back-1, front-1, qa, devops)
  0,1,1,2,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,0,
  // Row 8: floor + server rack start
  0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,5,5,1,0,
  // Row 9: floor + server rack end
  0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,5,5,1,0,
  // Row 10: floor
  0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,
  // Row 11: bottom wall
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
];

/** Color palette for tile types. */
export const TILE_COLORS: Record<TileTypeValue, string> = {
  [TileType.WALL]:        '#3d3d5c',
  [TileType.FLOOR]:       '#4a4a6a',
  [TileType.DESK]:        '#4a4a6a', // desk area is floor-colored; desk object drawn separately
  [TileType.MEETING]:     '#3a4a5c',
  [TileType.COFFEE]:      '#4a3a2a',
  [TileType.SERVER_RACK]: '#2a3a2a',
};

/** Agent desk position definition. */
export interface AgentDesk {
  readonly id: string;
  readonly label: string;
  readonly col: number;
  readonly row: number;
  readonly color: string;
}

/** Fixed desk positions for the 8 agents. */
export const AGENT_DESKS: readonly AgentDesk[] = [
  { id: 'pm',        label: 'PM',  col: 3,  row: 2, color: '#6366f1' },
  { id: 'tech-lead', label: 'TL',  col: 6,  row: 2, color: '#8b5cf6' },
  { id: 'po',        label: 'PO',  col: 9,  row: 2, color: '#ec4899' },
  { id: 'designer',  label: 'DSG', col: 12, row: 2, color: '#f59e0b' },
  { id: 'back-1',    label: 'BE',  col: 3,  row: 7, color: '#10b981' },
  { id: 'front-1',   label: 'FE',  col: 6,  row: 7, color: '#3b82f6' },
  { id: 'qa',        label: 'QA',  col: 9,  row: 7, color: '#ef4444' },
  { id: 'devops',    label: 'DO',  col: 12, row: 7, color: '#14b8a6' },
];

/** Get the tile type at a grid position. Returns WALL for out-of-bounds. */
export function getTile(col: number, row: number): TileTypeValue {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
    return TileType.WALL;
  }
  return TILE_LAYOUT[row * COLS + col];
}

/** Check if a tile is walkable (not a wall). */
export function isWalkable(col: number, row: number): boolean {
  return getTile(col, row) !== TileType.WALL;
}
