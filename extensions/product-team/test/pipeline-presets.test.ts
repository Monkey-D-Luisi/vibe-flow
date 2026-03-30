import { describe, it, expect } from 'vitest';
import {
  FULL_PIPELINE_STAGES,
  FULL_STAGE_OWNERS,
  MINIMAL_PIPELINE_STAGES,
  MINIMAL_STAGE_OWNERS,
  PLAYGROUND_PIPELINE_STAGES,
  PLAYGROUND_STAGE_OWNERS,
  validatePipelineConfig,
  getPreset,
} from '../src/config/pipeline-presets.js';

describe('Pipeline Presets', () => {
  describe('FULL preset', () => {
    it('has 10 stages', () => {
      expect(FULL_PIPELINE_STAGES).toHaveLength(10);
    });

    it('starts with IDEA and ends with DONE', () => {
      expect(FULL_PIPELINE_STAGES[0]).toBe('IDEA');
      expect(FULL_PIPELINE_STAGES[FULL_PIPELINE_STAGES.length - 1]).toBe('DONE');
    });

    it('has owners for all stages except DONE', () => {
      for (const stage of FULL_PIPELINE_STAGES) {
        expect(FULL_STAGE_OWNERS[stage]).toBeDefined();
      }
    });

    it('validates without errors', () => {
      const errors = validatePipelineConfig({ stages: FULL_PIPELINE_STAGES, owners: FULL_STAGE_OWNERS });
      expect(errors).toEqual([]);
    });
  });

  describe('MINIMAL preset', () => {
    it('has 5 stages', () => {
      expect(MINIMAL_PIPELINE_STAGES).toHaveLength(5);
    });

    it('starts with IDEA and ends with DONE', () => {
      expect(MINIMAL_PIPELINE_STAGES[0]).toBe('IDEA');
      expect(MINIMAL_PIPELINE_STAGES[MINIMAL_PIPELINE_STAGES.length - 1]).toBe('DONE');
    });

    it('uses only dev and qa agents (plus system)', () => {
      const agents = new Set(Object.values(MINIMAL_STAGE_OWNERS));
      expect(agents).toEqual(new Set(['dev', 'qa', 'system']));
    });

    it('has owners for all stages', () => {
      for (const stage of MINIMAL_PIPELINE_STAGES) {
        expect(MINIMAL_STAGE_OWNERS[stage]).toBeDefined();
      }
    });

    it('validates without errors', () => {
      const errors = validatePipelineConfig({ stages: MINIMAL_PIPELINE_STAGES, owners: MINIMAL_STAGE_OWNERS });
      expect(errors).toEqual([]);
    });
  });

  describe('PLAYGROUND preset', () => {
    it('has 4 stages', () => {
      expect(PLAYGROUND_PIPELINE_STAGES).toHaveLength(4);
    });

    it('starts with IDEA and ends with DONE', () => {
      expect(PLAYGROUND_PIPELINE_STAGES[0]).toBe('IDEA');
      expect(PLAYGROUND_PIPELINE_STAGES[PLAYGROUND_PIPELINE_STAGES.length - 1]).toBe('DONE');
    });

    it('uses only dev and qa agents (plus system)', () => {
      const agents = new Set(Object.values(PLAYGROUND_STAGE_OWNERS));
      expect(agents).toEqual(new Set(['dev', 'qa', 'system']));
    });

    it('validates without errors', () => {
      const errors = validatePipelineConfig({ stages: PLAYGROUND_PIPELINE_STAGES, owners: PLAYGROUND_STAGE_OWNERS });
      expect(errors).toEqual([]);
    });
  });

  describe('validatePipelineConfig', () => {
    it('rejects pipeline with less than 2 stages', () => {
      const errors = validatePipelineConfig({ stages: ['IDEA'], owners: { IDEA: 'dev' } });
      expect(errors).toContain('Pipeline must have at least 2 stages');
    });

    it('rejects pipeline not starting with IDEA', () => {
      const errors = validatePipelineConfig({ stages: ['START', 'DONE'], owners: { START: 'dev' } });
      expect(errors).toContain('First pipeline stage must be IDEA');
    });

    it('rejects pipeline not ending with DONE', () => {
      const errors = validatePipelineConfig({ stages: ['IDEA', 'END'], owners: { IDEA: 'dev', END: 'dev' } });
      expect(errors).toContain('Last pipeline stage must be DONE');
    });

    it('rejects duplicate stages', () => {
      const errors = validatePipelineConfig({
        stages: ['IDEA', 'QA', 'QA', 'DONE'],
        owners: { IDEA: 'dev', QA: 'qa' },
      });
      expect(errors).toContain('Duplicate stage: QA');
    });

    it('rejects missing stage owners', () => {
      const errors = validatePipelineConfig({
        stages: ['IDEA', 'BUILD', 'DONE'],
        owners: { IDEA: 'dev' },
      });
      expect(errors).toContain('Missing owner for stage: BUILD');
    });

    it('does not require owner for DONE', () => {
      const errors = validatePipelineConfig({
        stages: ['IDEA', 'DONE'],
        owners: { IDEA: 'dev' },
      });
      expect(errors).toEqual([]);
    });
  });

  describe('getPreset', () => {
    it('returns full preset', () => {
      const preset = getPreset('full');
      expect(preset.stages).toBe(FULL_PIPELINE_STAGES);
      expect(preset.owners).toBe(FULL_STAGE_OWNERS);
    });

    it('returns minimal preset', () => {
      const preset = getPreset('minimal');
      expect(preset.stages).toBe(MINIMAL_PIPELINE_STAGES);
      expect(preset.owners).toBe(MINIMAL_STAGE_OWNERS);
    });

    it('returns playground preset', () => {
      const preset = getPreset('playground');
      expect(preset.stages).toBe(PLAYGROUND_PIPELINE_STAGES);
      expect(preset.owners).toBe(PLAYGROUND_STAGE_OWNERS);
    });
  });
});
