import { describe, it, expect } from 'vitest';
import {
  FSM_STATES,
  FSM_CONFIG,
  canTransition,
  computeFrame,
} from '../src/shared/fsm-types.js';
import type { FsmState } from '../src/shared/fsm-types.js';

describe('FSM Types', () => {
  it('defines exactly 5 states', () => {
    expect(FSM_STATES).toHaveLength(5);
    expect(FSM_STATES).toContain('idle');
    expect(FSM_STATES).toContain('walking');
    expect(FSM_STATES).toContain('typing');
    expect(FSM_STATES).toContain('reading');
    expect(FSM_STATES).toContain('meeting');
  });

  it('every state has a config with positive frameCount and duration', () => {
    for (const state of FSM_STATES) {
      const config = FSM_CONFIG[state];
      expect(config.frameCount).toBeGreaterThan(0);
      expect(config.frameDurationMs).toBeGreaterThan(0);
    }
  });

  it('self-transitions are always valid', () => {
    for (const state of FSM_STATES) {
      expect(canTransition(state, state)).toBe(true);
    }
  });

  it('idle can transition to all action states', () => {
    const targets: FsmState[] = ['walking', 'typing', 'reading', 'meeting'];
    for (const target of targets) {
      expect(canTransition('idle', target)).toBe(true);
    }
  });

  it('action states can return to idle or walking', () => {
    const actionStates: FsmState[] = ['typing', 'reading', 'meeting'];
    for (const state of actionStates) {
      expect(canTransition(state, 'idle')).toBe(true);
      expect(canTransition(state, 'walking')).toBe(true);
    }
  });

  it('typing cannot transition directly to reading', () => {
    expect(canTransition('typing', 'reading')).toBe(false);
  });
});

describe('computeFrame', () => {
  it('returns frameIndex 0 at elapsed 0', () => {
    const result = computeFrame('idle', 0);
    expect(result.frameIndex).toBe(0);
    expect(result.cycled).toBe(false);
  });

  it('advances frame index based on elapsed time', () => {
    // idle: 2 frames at 800ms each -> frame 1 starts at 800ms
    const result = computeFrame('idle', 800);
    expect(result.frameIndex).toBe(1);
    expect(result.cycled).toBe(false);
  });

  it('cycles back to frame 0 when animation completes', () => {
    // idle: 2 frames * 800ms = 1600ms cycle
    const result = computeFrame('idle', 1600);
    expect(result.frameIndex).toBe(0);
    expect(result.cycled).toBe(true);
  });

  it('handles walk animation with 4 frames', () => {
    // walking: 4 frames at 150ms each
    const result = computeFrame('walking', 300);
    expect(result.frameIndex).toBe(2);
    expect(result.cycled).toBe(false);
  });

  it('cycles walk animation after full duration', () => {
    // walking: 4 * 150 = 600ms cycle
    const result = computeFrame('walking', 750);
    expect(result.frameIndex).toBe(1);
    expect(result.cycled).toBe(true);
  });
});
