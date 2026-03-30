import { describe, it, expect } from 'vitest';
import { getNextStage, getConfiguredStages, getConfiguredStageOwners, PIPELINE_STAGES, STAGE_OWNERS } from '../src/tools/pipeline.js';
import { MINIMAL_PIPELINE_STAGES, MINIMAL_STAGE_OWNERS, FULL_PIPELINE_STAGES } from '../src/config/pipeline-presets.js';

describe('Configurable Pipeline', () => {
  describe('getNextStage', () => {
    it('advances through default 10-stage pipeline', () => {
      expect(getNextStage('IDEA')).toBe('ROADMAP');
      expect(getNextStage('ROADMAP')).toBe('REFINEMENT');
      expect(getNextStage('SHIPPING')).toBe('DONE');
      expect(getNextStage('DONE')).toBeNull();
    });

    it('advances through minimal 5-stage pipeline', () => {
      const stages = [...MINIMAL_PIPELINE_STAGES];
      expect(getNextStage('IDEA', stages)).toBe('DECOMPOSITION');
      expect(getNextStage('DECOMPOSITION', stages)).toBe('IMPLEMENTATION');
      expect(getNextStage('IMPLEMENTATION', stages)).toBe('QA');
      expect(getNextStage('QA', stages)).toBe('DONE');
      expect(getNextStage('DONE', stages)).toBeNull();
    });

    it('returns null for unknown stage', () => {
      expect(getNextStage('NONEXISTENT')).toBeNull();
      expect(getNextStage('NONEXISTENT', [...MINIMAL_PIPELINE_STAGES])).toBeNull();
    });

    it('returns null for stage not in custom pipeline', () => {
      // ROADMAP exists in full but not in minimal
      expect(getNextStage('ROADMAP', [...MINIMAL_PIPELINE_STAGES])).toBeNull();
    });
  });

  describe('getConfiguredStages', () => {
    it('returns default stages when no config provided', () => {
      expect(getConfiguredStages()).toBe(PIPELINE_STAGES);
      expect(getConfiguredStages({})).toBe(PIPELINE_STAGES);
      expect(getConfiguredStages({ pipelineStages: [] })).toBe(PIPELINE_STAGES);
    });

    it('returns custom stages from config', () => {
      const stages = ['IDEA', 'BUILD', 'DONE'];
      expect(getConfiguredStages({ pipelineStages: stages })).toBe(stages);
    });

    it('returns minimal stages from config', () => {
      const result = getConfiguredStages({ pipelineStages: MINIMAL_PIPELINE_STAGES });
      expect(result).toBe(MINIMAL_PIPELINE_STAGES);
      expect(result).toHaveLength(5);
    });
  });

  describe('getConfiguredStageOwners', () => {
    it('returns default owners when no config provided', () => {
      expect(getConfiguredStageOwners()).toBe(STAGE_OWNERS);
      expect(getConfiguredStageOwners({})).toBe(STAGE_OWNERS);
      expect(getConfiguredStageOwners({ stageOwners: {} })).toBe(STAGE_OWNERS);
    });

    it('returns custom owners from config', () => {
      const owners = { IDEA: 'dev', IMPLEMENTATION: 'dev', QA: 'qa', DONE: 'system' };
      expect(getConfiguredStageOwners({ stageOwners: owners })).toBe(owners);
    });
  });

  describe('default pipeline regression', () => {
    it('maintains original 10 stages', () => {
      expect(PIPELINE_STAGES).toEqual(FULL_PIPELINE_STAGES);
    });

    it('maintains original stage count', () => {
      expect(PIPELINE_STAGES).toHaveLength(10);
    });

    it('STAGE_OWNERS covers all default stages', () => {
      for (const stage of PIPELINE_STAGES) {
        expect(STAGE_OWNERS[stage]).toBeDefined();
      }
    });

    it('full pipeline advance sequence is complete', () => {
      let current: string | null = 'IDEA';
      const visited: string[] = [current];
      while (current !== null) {
        current = getNextStage(current);
        if (current) visited.push(current);
      }
      expect(visited).toEqual([...PIPELINE_STAGES]);
    });

    it('minimal pipeline advance sequence is complete', () => {
      let current: string | null = 'IDEA';
      const stages = [...MINIMAL_PIPELINE_STAGES];
      const visited: string[] = [current];
      while (current !== null) {
        current = getNextStage(current, stages);
        if (current) visited.push(current);
      }
      expect(visited).toEqual(stages);
    });
  });
});
