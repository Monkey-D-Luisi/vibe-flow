/**
 * Tile Map -- Office layout rendering helpers.
 *
 * Re-exports tile data from shared module and provides
 * frontend-specific zone query utilities.
 */

export {
  COLS, ROWS, TILE_SIZE, ZOOM, SCALED_TILE,
  TileType, TILE_LAYOUT, TILE_COLORS,
  AGENT_DESKS, getTile, isWalkable,
} from '../../shared/tile-data.js';
export type { AgentDesk, TileTypeValue } from '../../shared/tile-data.js';
