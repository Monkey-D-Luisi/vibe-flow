/**
 * Agent Self-Evaluation -- Structured self-assessment before pipeline advance.
 *
 * Agents must evaluate their own work before handing off to the next stage.
 * This enforces reflection and catches quality issues earlier. The evaluation
 * is stored in task metadata for review loops and retrospectives.
 *
 * Task 0144 (EP21) -- depends on Task 0141 (pre-advance quality validation)
 */

/**
 * Stages that require a self-evaluation before advancing.
 * Non-gated stages (IDEA, ROADMAP, etc.) proceed without evaluation.
 */
const EVALUATION_REQUIRED_STAGES = new Set([
  'IMPLEMENTATION',
  'QA',
  'REVIEW',
  'DESIGN',
]);

/** Structured self-evaluation from an agent. */
export interface SelfEvaluation {
  readonly confidence: number;       // 1-5 scale
  readonly completeness: number;     // 1-5 scale
  readonly risks: string;            // known risks or concerns
  readonly summary: string;          // what was done
}

/** Validation failure for self-evaluation. */
export interface SelfEvaluationFailure {
  readonly rule: string;
  readonly message: string;
}

/** Configuration for self-evaluation enforcement. */
export interface SelfEvaluationConfig {
  readonly enabled: boolean;
  readonly minConfidence: number;    // minimum confidence score (1-5)
  readonly minCompleteness: number;  // minimum completeness score (1-5)
}

export const DEFAULT_SELF_EVAL_CONFIG: SelfEvaluationConfig = {
  enabled: true,
  minConfidence: 2,
  minCompleteness: 2,
};

/**
 * Check whether the current stage requires a self-evaluation.
 */
export function stageRequiresEvaluation(stage: string): boolean {
  return EVALUATION_REQUIRED_STAGES.has(stage);
}

/**
 * Parse and validate a raw self-evaluation input.
 *
 * Accepts either:
 * - A structured object with confidence/completeness/risks/summary
 * - A string (treated as summary with default scores)
 *
 * Returns null if the input is not a valid self-evaluation.
 */
export function parseSelfEvaluation(raw: unknown): SelfEvaluation | null {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return {
      confidence: 3,
      completeness: 3,
      risks: 'none specified',
      summary: raw.trim(),
    };
  }

  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  const confidence = typeof obj['confidence'] === 'number' ? obj['confidence'] : null;
  const completeness = typeof obj['completeness'] === 'number' ? obj['completeness'] : null;
  const summary = typeof obj['summary'] === 'string' ? obj['summary'] : null;
  const risks = typeof obj['risks'] === 'string' ? obj['risks'] : 'none specified';

  if (confidence === null || completeness === null || !summary || summary.trim().length === 0) {
    return null;
  }

  return {
    confidence: Math.max(1, Math.min(5, Math.round(confidence))),
    completeness: Math.max(1, Math.min(5, Math.round(completeness))),
    risks,
    summary: summary.trim(),
  };
}

/**
 * Validate a self-evaluation against minimum thresholds.
 *
 * Returns an array of failures (empty if valid).
 */
export function validateSelfEvaluation(
  stage: string,
  evaluation: SelfEvaluation | null,
  config: SelfEvaluationConfig = DEFAULT_SELF_EVAL_CONFIG,
): SelfEvaluationFailure[] {
  if (!config.enabled) return [];
  if (!stageRequiresEvaluation(stage)) return [];

  const failures: SelfEvaluationFailure[] = [];

  if (!evaluation) {
    failures.push({
      rule: 'self_evaluation_required',
      message: `Stage ${stage} requires a self-evaluation. Include a selfEvaluation param with confidence (1-5), completeness (1-5), and summary. risks is optional.`,
    });
    return failures;
  }

  if (evaluation.confidence < config.minConfidence) {
    failures.push({
      rule: 'confidence_too_low',
      message: `Confidence score ${evaluation.confidence} is below minimum ${config.minConfidence}. Consider revisiting your work before advancing.`,
    });
  }

  if (evaluation.completeness < config.minCompleteness) {
    failures.push({
      rule: 'completeness_too_low',
      message: `Completeness score ${evaluation.completeness} is below minimum ${config.minCompleteness}. Ensure all requirements are addressed before advancing.`,
    });
  }

  return failures;
}
