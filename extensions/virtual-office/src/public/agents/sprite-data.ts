/**
 * Sprite Data -- Procedural 16x16 pixel-art for 8 agents.
 *
 * Each sprite is a Uint8Array(256) where each value is a palette index.
 * Index 0 = transparent. Indices 1-6 map to agent-specific colors.
 *
 * Palette slots: [transparent, skin, hair, shirt, pants, accent]
 */

import type { FsmState } from '../../shared/fsm-types.js';

/** Agent color palette (6 colors). */
export interface AgentPalette {
  readonly skin: string;
  readonly hair: string;
  readonly shirt: string;
  readonly pants: string;
  readonly accent: string;
}

/** Agent sprite definitions. */
export interface AgentSpriteSet {
  readonly palette: AgentPalette;
  readonly frames: Record<FsmState, Uint8Array[]>;
}

// --- Base humanoid template (16x16) ---
// 0=transparent, 1=skin, 2=hair, 3=shirt, 4=pants, 5=accent
// prettier-ignore
const BASE_IDLE_1 = new Uint8Array([
  0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,1,0,1,1,0,1,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,1,3,3,3,3,3,3,3,3,1,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,
]);

// Idle frame 2: slight shift (breathing effect - torso 1px up)
// prettier-ignore
const BASE_IDLE_2 = new Uint8Array([
  0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,1,0,1,1,0,1,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,1,3,3,3,3,3,3,3,3,1,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,
]);

// Walk frames: leg alternation
// prettier-ignore
const BASE_WALK_1 = new Uint8Array([
  0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,1,0,1,1,0,1,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,1,3,3,3,3,3,3,3,3,1,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,4,4,0,0,0,0,4,4,0,0,0,0,
  0,0,0,0,4,0,0,0,0,0,0,4,0,0,0,0,
  0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,
]);

// prettier-ignore
const BASE_WALK_2 = new Uint8Array([
  0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,1,0,1,1,0,1,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,1,3,3,3,3,3,3,3,3,1,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,1,4,0,0,4,1,0,0,0,0,0,
  0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,
]);

// Walk 3&4 are same as 1&2 but mirrored legs
const BASE_WALK_3 = flipHorizontal(BASE_WALK_1);
const BASE_WALK_4 = flipHorizontal(BASE_WALK_2);

// Typing: arms down at desk level
// prettier-ignore
const BASE_TYPE_1 = new Uint8Array([
  0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,1,0,1,1,0,1,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,1,1,3,3,3,3,3,3,1,1,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,
]);

// prettier-ignore
const BASE_TYPE_2 = new Uint8Array([
  0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,1,0,1,1,0,1,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,1,1,0,3,3,3,3,3,3,0,1,1,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,
]);

// Reading: head tilted slightly, holding paper
// prettier-ignore
const BASE_READ_1 = new Uint8Array([
  0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,2,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,1,0,1,1,0,1,0,0,0,0,0,0,
  0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,5,0,0,0,
  0,0,0,1,3,3,3,3,3,3,3,3,5,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,5,5,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,
]);

// prettier-ignore
const BASE_READ_2 = new Uint8Array([
  0,0,0,0,0,0,2,2,2,2,0,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,2,2,2,2,2,2,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,1,0,1,1,0,1,0,0,0,0,0,
  0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,
  0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,0,0,0,0,
  0,0,0,0,3,3,3,3,3,3,3,3,5,0,0,0,
  0,0,0,1,3,3,3,3,3,3,3,3,5,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,5,5,0,0,0,
  0,0,0,0,0,4,4,4,4,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,4,4,0,0,4,4,0,0,0,0,0,
  0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,
]);

// Meeting: same as idle (standing near table)
const BASE_MEETING_1 = BASE_IDLE_1;
const BASE_MEETING_2 = BASE_IDLE_2;

/** Flip a 16x16 sprite horizontally. */
function flipHorizontal(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(256);
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      out[r * 16 + c] = src[r * 16 + (15 - c)];
    }
  }
  return out;
}

/** Apply a distinguishing feature to a sprite frame. */
function applyFeature(
  src: Uint8Array,
  pixels: Array<{ x: number; y: number; idx: number }>,
): Uint8Array {
  const out = new Uint8Array(src);
  for (const p of pixels) {
    out[p.y * 16 + p.x] = p.idx;
  }
  return out;
}

// --- Agent palette definitions ---

const PALETTES: Record<string, AgentPalette> = {
  pm:        { skin: '#ffd5b0', hair: '#2d1b00', shirt: '#6366f1', pants: '#374151', accent: '#818cf8' },
  'tech-lead': { skin: '#ffd5b0', hair: '#1a1a2e', shirt: '#8b5cf6', pants: '#374151', accent: '#c4b5fd' },
  po:        { skin: '#ffe0c0', hair: '#8b4513', shirt: '#ec4899', pants: '#374151', accent: '#f9a8d4' },
  designer:  { skin: '#ffd5b0', hair: '#4a3000', shirt: '#f59e0b', pants: '#374151', accent: '#fbbf24' },
  'back-1':  { skin: '#ffd5b0', hair: '#1a1a1a', shirt: '#10b981', pants: '#1e293b', accent: '#6ee7b7' },
  'front-1': { skin: '#ffd5b0', hair: '#3b2000', shirt: '#3b82f6', pants: '#1e293b', accent: '#93c5fd' },
  qa:        { skin: '#ffd5b0', hair: '#2d1b00', shirt: '#ef4444', pants: '#374151', accent: '#fca5a5' },
  devops:    { skin: '#ffd5b0', hair: '#1a1a1a', shirt: '#14b8a6', pants: '#1e293b', accent: '#5eead4' },
};

// Distinguishing features per agent (applied to accent slot)
const FEATURES: Record<string, Array<{ x: number; y: number; idx: number }>> = {
  // PM: tie
  pm: [{ x: 7, y: 7, idx: 5 }, { x: 8, y: 7, idx: 5 }, { x: 7, y: 8, idx: 5 }],
  // Tech Lead: glasses
  'tech-lead': [{ x: 5, y: 4, idx: 5 }, { x: 6, y: 4, idx: 5 }, { x: 9, y: 4, idx: 5 }, { x: 10, y: 4, idx: 5 }],
  // PO: earring
  po: [{ x: 11, y: 4, idx: 5 }],
  // Designer: beret
  designer: [{ x: 5, y: 0, idx: 5 }, { x: 6, y: 0, idx: 5 }, { x: 7, y: 0, idx: 5 }, { x: 8, y: 0, idx: 5 }, { x: 9, y: 0, idx: 5 }, { x: 10, y: 0, idx: 5 }],
  // Back-1: hoodie hood
  'back-1': [{ x: 4, y: 7, idx: 3 }, { x: 11, y: 7, idx: 3 }, { x: 4, y: 1, idx: 3 }, { x: 11, y: 1, idx: 3 }],
  // Front-1: headphones
  'front-1': [{ x: 4, y: 2, idx: 5 }, { x: 4, y: 3, idx: 5 }, { x: 11, y: 2, idx: 5 }, { x: 11, y: 3, idx: 5 }],
  // QA: badge
  qa: [{ x: 4, y: 8, idx: 5 }, { x: 4, y: 9, idx: 5 }],
  // DevOps: cap
  devops: [{ x: 5, y: 0, idx: 3 }, { x: 6, y: 0, idx: 3 }, { x: 7, y: 0, idx: 3 }, { x: 8, y: 0, idx: 3 }, { x: 9, y: 0, idx: 3 }, { x: 10, y: 0, idx: 3 }, { x: 11, y: 0, idx: 3 }],
};

/** Base frames for all animation states. */
const BASE_FRAMES: Record<FsmState, Uint8Array[]> = {
  idle:    [BASE_IDLE_1, BASE_IDLE_2],
  walking: [BASE_WALK_1, BASE_WALK_2, BASE_WALK_3, BASE_WALK_4],
  typing:  [BASE_TYPE_1, BASE_TYPE_2],
  reading: [BASE_READ_1, BASE_READ_2],
  meeting: [BASE_MEETING_1, BASE_MEETING_2],
};

/** Generate all frames for one agent by applying their features. */
function generateAgentFrames(agentId: string): Record<FsmState, Uint8Array[]> {
  const features = FEATURES[agentId] ?? [];
  const result: Record<string, Uint8Array[]> = {};

  for (const [state, baseFrames] of Object.entries(BASE_FRAMES)) {
    result[state] = baseFrames.map(frame => applyFeature(frame, features));
  }

  return result as Record<FsmState, Uint8Array[]>;
}

/** All agent sprite sets, keyed by agent ID. */
export const AGENT_SPRITES: Record<string, AgentSpriteSet> = {};

for (const [agentId, palette] of Object.entries(PALETTES)) {
  AGENT_SPRITES[agentId] = {
    palette,
    frames: generateAgentFrames(agentId),
  };
}

/** Get a palette as an array of hex colors (index 0 = transparent). */
export function paletteToColors(palette: AgentPalette): string[] {
  return ['', palette.skin, palette.hair, palette.shirt, palette.pants, palette.accent];
}

/** Total number of unique agents with sprites. */
export const AGENT_COUNT = Object.keys(AGENT_SPRITES).length;
