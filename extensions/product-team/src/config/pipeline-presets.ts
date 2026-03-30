/**
 * Pipeline Presets (EP30 Task 0192)
 *
 * Configurable pipeline topologies: full 10-stage (default), minimal 5-stage
 * (2-agent mode), and playground 4-stage (Task 0195).
 */

// ── Full 10-stage pipeline (current default) ──────────────────────────────────

export const FULL_PIPELINE_STAGES = [
  'IDEA', 'ROADMAP', 'REFINEMENT', 'DECOMPOSITION', 'DESIGN',
  'IMPLEMENTATION', 'QA', 'REVIEW', 'SHIPPING', 'DONE',
] as const;

export const FULL_STAGE_OWNERS: Record<string, string> = {
  IDEA: 'pm',
  ROADMAP: 'pm',
  REFINEMENT: 'po',
  DECOMPOSITION: 'tech-lead',
  DESIGN: 'designer',
  IMPLEMENTATION: 'back-1',
  QA: 'qa',
  REVIEW: 'tech-lead',
  SHIPPING: 'devops',
  DONE: 'system',
};

// ── Minimal 5-stage pipeline (2-agent mode: dev + qa) ─────────────────────────

export const MINIMAL_PIPELINE_STAGES = [
  'IDEA', 'DECOMPOSITION', 'IMPLEMENTATION', 'QA', 'DONE',
] as const;

export const MINIMAL_STAGE_OWNERS: Record<string, string> = {
  IDEA: 'dev',
  DECOMPOSITION: 'dev',
  IMPLEMENTATION: 'dev',
  QA: 'qa',
  DONE: 'system',
};

// ── Playground 4-stage pipeline (Task 0195) ───────────────────────────────────

export const PLAYGROUND_PIPELINE_STAGES = [
  'IDEA', 'IMPLEMENTATION', 'QA', 'DONE',
] as const;

export const PLAYGROUND_STAGE_OWNERS: Record<string, string> = {
  IDEA: 'dev',
  IMPLEMENTATION: 'dev',
  QA: 'qa',
  DONE: 'system',
};

// ── Validation ────────────────────────────────────────────────────────────────

export interface PipelinePresetConfig {
  readonly stages: readonly string[];
  readonly owners: Readonly<Record<string, string>>;
}

/**
 * Validate that a pipeline config is consistent:
 * - At least 2 stages (IDEA + DONE minimum)
 * - First stage must be IDEA, last must be DONE
 * - Every stage has an owner
 * - No duplicate stages
 */
export function validatePipelineConfig(config: PipelinePresetConfig): string[] {
  const errors: string[] = [];

  if (config.stages.length < 2) {
    errors.push('Pipeline must have at least 2 stages');
  }

  if (config.stages[0] !== 'IDEA') {
    errors.push('First pipeline stage must be IDEA');
  }

  if (config.stages[config.stages.length - 1] !== 'DONE') {
    errors.push('Last pipeline stage must be DONE');
  }

  const seen = new Set<string>();
  for (const stage of config.stages) {
    if (seen.has(stage)) {
      errors.push(`Duplicate stage: ${stage}`);
    }
    seen.add(stage);
  }

  for (const stage of config.stages) {
    if (stage === 'DONE') continue; // DONE owner is always 'system', optional in config
    if (!config.owners[stage]) {
      errors.push(`Missing owner for stage: ${stage}`);
    }
  }

  return errors;
}

/**
 * Get a named preset configuration.
 */
export function getPreset(name: 'full' | 'minimal' | 'playground'): PipelinePresetConfig {
  switch (name) {
    case 'full':
      return { stages: FULL_PIPELINE_STAGES, owners: FULL_STAGE_OWNERS };
    case 'minimal':
      return { stages: MINIMAL_PIPELINE_STAGES, owners: MINIMAL_STAGE_OWNERS };
    case 'playground':
      return { stages: PLAYGROUND_PIPELINE_STAGES, owners: PLAYGROUND_STAGE_OWNERS };
  }
}
