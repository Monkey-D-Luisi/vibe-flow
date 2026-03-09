import { Type, type Static } from '@sinclair/typebox';

export const PatternType = Type.Union([
  Type.Literal('escalation_candidate'),
  Type.Literal('auto_candidate'),
  Type.Literal('failure_cluster'),
  Type.Literal('timeout_pattern'),
], { description: 'Type of detected decision pattern' });
export type PatternType = Static<typeof PatternType>;

export const PatternEvidence = Type.Object({
  decisionId: Type.String(),
  outcome: Type.String(),
}, { description: 'Evidence record linking a decision to its outcome' });
export type PatternEvidence = Static<typeof PatternEvidence>;

export const Pattern = Type.Object({
  type: PatternType,
  agentId: Type.String({ description: 'Agent involved in the pattern' }),
  category: Type.String({ description: 'Decision category' }),
  confidence: Type.Number({ minimum: 0, maximum: 1, description: 'Confidence score 0-1' }),
  evidence: Type.Array(PatternEvidence, { description: 'Decision evidence records' }),
}, { description: 'A detected decision pattern' });
export type Pattern = Static<typeof Pattern>;

export const RecommendationAction = Type.Union([
  Type.Literal('change_policy'),
  Type.Literal('adjust_timeout'),
  Type.Literal('upgrade_model'),
  Type.Literal('alert_human'),
], { description: 'Recommended action type' });

export const Recommendation = Type.Object({
  patternType: PatternType,
  action: RecommendationAction,
  details: Type.Record(Type.String(), Type.Unknown(), { description: 'Action-specific details' }),
  confidence: Type.Number({ minimum: 0, maximum: 1, description: 'Confidence score' }),
}, { description: 'A recommended action based on detected patterns' });
export type Recommendation = Static<typeof Recommendation>;

export const PatternReport = Type.Object({
  analyzedDecisions: Type.Number({ description: 'Number of decisions analyzed' }),
  timeRange: Type.Object({
    from: Type.String({ description: 'Earliest decision timestamp' }),
    to: Type.String({ description: 'Latest decision timestamp' }),
  }),
  patterns: Type.Array(Pattern, { description: 'Detected patterns' }),
  recommendations: Type.Array(Recommendation, { description: 'Recommended actions' }),
}, { description: 'Full pattern analysis report' });
export type PatternReport = Static<typeof PatternReport>;

export const DecisionPatternsParams = Type.Object({
  lastN: Type.Optional(Type.Number({
    minimum: 1,
    maximum: 1000,
    description: 'Number of recent decisions to analyze (default: 100)',
  })),
  minConfidence: Type.Optional(Type.Number({
    minimum: 0,
    maximum: 1,
    description: 'Minimum confidence threshold for patterns (default: 0.7)',
  })),
});
export type DecisionPatternsParams = Static<typeof DecisionPatternsParams>;
