/**
 * Task Complexity Scoring Engine
 *
 * Pure function that evaluates task complexity from available metadata and
 * produces a numeric score (0-100) used by the model resolver to route
 * LLM requests to the appropriate model tier.
 *
 * EP10 Task 0079
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Pipeline stages recognized by the scorer. */
export type PipelineStage =
  | 'IDEA'
  | 'ROADMAP'
  | 'REFINEMENT'
  | 'DECOMPOSITION'
  | 'DESIGN'
  | 'IMPLEMENTATION'
  | 'QA'
  | 'REVIEW'
  | 'SHIPPING'
  | 'DONE';

/** Task scope values. */
export type TaskScope = 'minor' | 'major' | 'patch' | 'critical';

/** Agent roles recognized by the scorer. */
export type AgentRole =
  | 'pm'
  | 'po'
  | 'tech-lead'
  | 'designer'
  | 'back-1'
  | 'front-1'
  | 'qa'
  | 'devops'
  | 'system';

/** Input metadata used for scoring. All fields are optional — missing fields default to neutral. */
export interface ComplexityInput {
  /** Task scope: minor, major, patch, or critical. */
  scope?: TaskScope;
  /** Current pipeline stage. */
  stage?: PipelineStage;
  /** Agent role assigned to the stage. */
  agentRole?: AgentRole;
  /** Duration of the current stage in milliseconds (historical or current). */
  stageDurationMs?: number;
  /** Median duration for this stage type in milliseconds (from historical data). */
  stageMedianDurationMs?: number;
  /** Number of files changed (if known from prior stages). */
  filesChanged?: number;
}

/** A single factor that contributed to the final score. */
export interface Factor {
  /** Factor name. */
  name: string;
  /** Points contributed (positive or negative). */
  points: number;
  /** Human-readable description. */
  description: string;
}

/** Complexity tier derived from the final score. */
export type ComplexityTier = 'low' | 'medium' | 'high';

/** Result of scoring a task's complexity. */
export interface ComplexityScore {
  /** Final score clamped to [0, 100]. */
  score: number;
  /** Tier derived from score: low (0-33), medium (34-66), high (67-100). */
  tier: ComplexityTier;
  /** Individual factors that contributed to the score. */
  factors: Factor[];
}

/** Configurable weights for each scoring dimension. */
export interface ComplexityConfig {
  /** Base scores by task scope. */
  scopeScores: Record<TaskScope, number>;
  /** Score modifiers by pipeline stage. */
  stageModifiers: Partial<Record<PipelineStage, number>>;
  /** Score modifiers by agent role. */
  roleModifiers: Partial<Record<AgentRole, number>>;
  /** Points added when stage duration exceeds 2x median. */
  historyOverrunBonus: number;
  /** Points per 10 files changed. */
  filesChangedPer10: number;
  /** Tier boundaries: [low ceiling, medium ceiling]. high = everything above. */
  tierBoundaries: [number, number];
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

export const DEFAULT_CONFIG: Readonly<ComplexityConfig> = {
  scopeScores: {
    patch: 10,
    minor: 20,
    major: 50,
    critical: 80,
  },
  stageModifiers: {
    IDEA: -10,
    ROADMAP: -10,
    REFINEMENT: -5,
    DECOMPOSITION: 5,
    DESIGN: 0,
    IMPLEMENTATION: 15,
    QA: 5,
    REVIEW: 15,
    SHIPPING: 0,
    DONE: -10,
  },
  roleModifiers: {
    pm: -10,
    po: -10,
    designer: 0,
    'tech-lead': 15,
    'back-1': 10,
    'front-1': 10,
    qa: 5,
    devops: 0,
    system: -10,
  },
  historyOverrunBonus: 10,
  filesChangedPer10: 5,
  tierBoundaries: [33, 66],
};

/* ------------------------------------------------------------------ */
/*  Scoring                                                            */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deriveTier(score: number, boundaries: [number, number]): ComplexityTier {
  if (score <= boundaries[0]) return 'low';
  if (score <= boundaries[1]) return 'medium';
  return 'high';
}

/**
 * Compute a complexity score for a task given its metadata.
 *
 * The function is **pure**: no side effects, no I/O, deterministic for the
 * same inputs. All scoring weights are configurable via `config`.
 */
export function scoreComplexity(
  input: ComplexityInput,
  config: ComplexityConfig = DEFAULT_CONFIG,
): ComplexityScore {
  const factors: Factor[] = [];

  // 1. Base score from scope
  const scope = input.scope ?? 'minor';
  const baseScore = config.scopeScores[scope] ?? config.scopeScores['minor'] ?? DEFAULT_CONFIG.scopeScores.minor;
  factors.push({
    name: 'scope',
    points: baseScore,
    description: `Base score for scope '${scope}'`,
  });

  // 2. Stage modifier
  if (input.stage !== undefined) {
    const modifier = config.stageModifiers[input.stage] ?? 0;
    if (modifier !== 0) {
      factors.push({
        name: 'stage',
        points: modifier,
        description: `Stage modifier for '${input.stage}'`,
      });
    }
  }

  // 3. Role modifier
  if (input.agentRole !== undefined) {
    const modifier = config.roleModifiers[input.agentRole] ?? 0;
    if (modifier !== 0) {
      factors.push({
        name: 'role',
        points: modifier,
        description: `Role modifier for '${input.agentRole}'`,
      });
    }
  }

  // 4. Historical duration overrun
  if (
    input.stageDurationMs !== undefined &&
    input.stageMedianDurationMs !== undefined &&
    input.stageMedianDurationMs > 0 &&
    input.stageDurationMs > 2 * input.stageMedianDurationMs
  ) {
    factors.push({
      name: 'history_overrun',
      points: config.historyOverrunBonus,
      description: `Stage duration (${input.stageDurationMs}ms) exceeds 2x median (${input.stageMedianDurationMs}ms)`,
    });
  }

  // 5. Files changed bonus
  if (
    input.filesChanged !== undefined &&
    input.filesChanged > 0 &&
    config.filesChangedPer10 > 0
  ) {
    const bonus = Math.floor(input.filesChanged / 10) * config.filesChangedPer10;
    if (bonus > 0) {
      factors.push({
        name: 'files_changed',
        points: bonus,
        description: `${input.filesChanged} files changed (+${config.filesChangedPer10} per 10 files)`,
      });
    }
  }

  // Sum and clamp
  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  const score = clamp(rawScore, 0, 100);
  const tier = deriveTier(score, config.tierBoundaries);

  return { score, tier, factors };
}
