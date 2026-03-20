import { describe, it, expect } from 'vitest';
import { AGENT_SPRITES, AGENT_COUNT, paletteToColors } from '../src/public/agents/sprite-data.js';
import { FSM_STATES } from '../src/shared/fsm-types.js';
import type { FsmState } from '../src/shared/fsm-types.js';

const EXPECTED_FRAME_COUNTS: Record<FsmState, number> = {
  idle: 2,
  walking: 4,
  typing: 2,
  reading: 2,
  meeting: 2,
};

describe('sprite-data', () => {
  it('exports exactly 8 agents', () => {
    expect(AGENT_COUNT).toBe(8);
    expect(Object.keys(AGENT_SPRITES)).toHaveLength(8);
  });

  it('every agent has frames for all FSM states', () => {
    for (const [agentId, spriteSet] of Object.entries(AGENT_SPRITES)) {
      for (const state of FSM_STATES) {
        expect(spriteSet.frames[state], `${agentId} missing state ${state}`).toBeDefined();
      }
    }
  });

  it('every frame is a Uint8Array of 256 elements', () => {
    for (const [agentId, spriteSet] of Object.entries(AGENT_SPRITES)) {
      for (const [state, frames] of Object.entries(spriteSet.frames)) {
        for (let i = 0; i < frames.length; i++) {
          expect(frames[i]).toBeInstanceOf(Uint8Array);
          expect(frames[i].length, `${agentId}/${state}[${i}]`).toBe(256);
        }
      }
    }
  });

  it('frame counts match expected animation lengths', () => {
    for (const [agentId, spriteSet] of Object.entries(AGENT_SPRITES)) {
      for (const state of FSM_STATES) {
        const expected = EXPECTED_FRAME_COUNTS[state];
        expect(
          spriteSet.frames[state].length,
          `${agentId}/${state} frame count`,
        ).toBe(expected);
      }
    }
  });

  it('palette indices stay within bounds (0-5)', () => {
    for (const [agentId, spriteSet] of Object.entries(AGENT_SPRITES)) {
      for (const [state, frames] of Object.entries(spriteSet.frames)) {
        for (const frame of frames) {
          for (let i = 0; i < frame.length; i++) {
            expect(frame[i], `${agentId}/${state} pixel ${i}`).toBeLessThanOrEqual(5);
          }
        }
      }
    }
  });

  it('paletteToColors returns 6-element array with empty first slot', () => {
    const spriteSet = AGENT_SPRITES['pm']!;
    const colors = paletteToColors(spriteSet.palette);
    expect(colors).toHaveLength(6);
    expect(colors[0]).toBe('');
    for (let i = 1; i < colors.length; i++) {
      expect(colors[i]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('each agent has a unique shirt color', () => {
    const shirtColors = Object.values(AGENT_SPRITES).map(s => s.palette.shirt);
    const unique = new Set(shirtColors);
    expect(unique.size).toBe(shirtColors.length);
  });
});
