import { describe, it, expect } from 'vitest';
import {
  PIPELINE_STAGES,
  STAGE_OWNERS,
  STAGE_LOCATIONS,
  getStageLocation,
} from '../src/shared/stage-location-map.js';

describe('stage-location-map', () => {
  it('defines all 10 pipeline stages', () => {
    expect(PIPELINE_STAGES).toHaveLength(10);
  });

  it('every stage has an owner', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(STAGE_OWNERS[stage]).toBeDefined();
      expect(typeof STAGE_OWNERS[stage]).toBe('string');
    }
  });

  it('every stage has a location mapping', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(STAGE_LOCATIONS[stage]).toBeDefined();
    }
  });

  it('meeting stages map to the meeting room area', () => {
    const meetingStages = ['IDEA', 'ROADMAP', 'REFINEMENT', 'DECOMPOSITION'] as const;
    for (const stage of meetingStages) {
      const loc = STAGE_LOCATIONS[stage];
      expect(loc).not.toBe('own-desk');
      if (loc !== 'own-desk') {
        expect(loc.activity).toBe('meeting');
        expect(loc.col).toBeGreaterThanOrEqual(7);
        expect(loc.col).toBeLessThanOrEqual(11);
        expect(loc.row).toBeGreaterThanOrEqual(3);
        expect(loc.row).toBeLessThanOrEqual(5);
      }
    }
  });

  it('own-desk stages return desk coordinates with typing activity', () => {
    const typingStages = ['IMPLEMENTATION', 'QA', 'REVIEW'] as const;
    for (const stage of typingStages) {
      expect(STAGE_LOCATIONS[stage]).toBe('own-desk');
      const loc = getStageLocation(stage, 5, 3);
      expect(loc.col).toBe(5);
      expect(loc.row).toBe(3);
      expect(loc.activity).toBe('typing');
    }
  });

  it('DONE stage returns desk coordinates with idle activity', () => {
    expect(STAGE_LOCATIONS['DONE']).toBe('own-desk');
    const loc = getStageLocation('DONE', 5, 3);
    expect(loc.col).toBe(5);
    expect(loc.row).toBe(3);
    expect(loc.activity).toBe('idle');
  });

  it('SHIPPING maps to server rack area', () => {
    const loc = STAGE_LOCATIONS['SHIPPING'];
    expect(loc).not.toBe('own-desk');
    if (loc !== 'own-desk') {
      expect(loc.col).toBe(16);
      expect(loc.row).toBe(8);
      expect(loc.activity).toBe('typing');
    }
  });

  it('unknown stage returns desk position with idle', () => {
    const loc = getStageLocation('UNKNOWN_STAGE', 7, 4);
    expect(loc.col).toBe(7);
    expect(loc.row).toBe(4);
    expect(loc.activity).toBe('idle');
  });
});
