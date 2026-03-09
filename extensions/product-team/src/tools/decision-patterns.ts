import type { ToolDef, ToolDeps } from './index.js';
import { DecisionPatternsParams } from '../schemas/decision-patterns.schema.js';
import { DecisionPatternAnalyzer } from '../orchestrator/decision-pattern-analyzer.js';

/**
 * Read-only tool that analyzes decision outcome history and reports
 * detected patterns with recommendations for policy adjustments.
 */
export function decisionPatternsToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'decision.patterns',
    label: 'Decision Patterns',
    description: 'Analyze decision outcome history to detect patterns and recommend policy adjustments (read-only)',
    parameters: DecisionPatternsParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ lastN?: number; minConfidence?: number }>(
        DecisionPatternsParams,
        params,
      );

      const analyzer = new DecisionPatternAnalyzer(deps.db);
      const report = analyzer.analyze({
        lastN: input.lastN,
        minConfidence: input.minConfidence,
      });

      deps.logger?.info(
        `decision.patterns: Analyzed ${report.analyzedDecisions} decisions, ` +
        `found ${report.patterns.length} patterns, ${report.recommendations.length} recommendations`,
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }],
        details: report,
      };
    },
  };
}
