/**
 * Zones -- Named semantic regions in the office.
 *
 * Maps zone names to tile coordinate regions for agent navigation
 * and state mapping (task 0132).
 */

import { AGENT_DESKS } from '../../shared/tile-data.js';
import type { AgentDesk } from '../../shared/tile-data.js';

export interface Zone {
  readonly name: string;
  /** Center tile coordinate. */
  readonly col: number;
  readonly row: number;
}

/** Fixed zones in the office. */
export const ZONES: Record<string, Zone> = {
  meeting:     { name: 'Meeting Room',  col: 9,  row: 4 },
  coffee:      { name: 'Coffee Area',   col: 16, row: 3 },
  serverRack:  { name: 'Server Rack',   col: 16, row: 8 },
};

/** Get an agent's desk zone. */
export function getAgentDesk(agentId: string): AgentDesk | undefined {
  return AGENT_DESKS.find(d => d.id === agentId);
}
