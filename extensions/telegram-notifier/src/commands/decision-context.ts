/**
 * Decision Context -- Rich approval workflows with inline context.
 *
 * Enriches the /decisions display with task context, quality metrics,
 * and budget information so the human operator can make informed decisions.
 *
 * Task 0107 (EP15)
 */

import { escapeMarkdownV2 } from '../formatting.js';
import type { ApiDecision, ApiMetricsResponse } from '../api-client.js';

/** Data source abstraction for testability. */
export interface DecisionContextDataSource {
  listPendingDecisions(): Promise<ApiDecision[]>;
  getMetrics(): Promise<ApiMetricsResponse>;
}

export function renderDecisionWithContext(
  decision: ApiDecision,
  metrics: ApiMetricsResponse | null,
): string {
  const lines: string[] = [];
  lines.push('```');
  lines.push(`Decision: ${decision.id.slice(-12)}`);
  lines.push('─'.repeat(45));
  lines.push(`Category: ${decision.category}`);
  lines.push(`Question: ${decision.question.slice(0, 120)}`);
  lines.push(`Approver: ${decision.approver ?? 'human'}`);
  lines.push(`Created:  ${decision.created_at}`);

  if (metrics) {
    const budgetPct = metrics.budget.globalLimitUsd > 0
      ? Math.round((metrics.budget.globalConsumedUsd / metrics.budget.globalLimitUsd) * 100)
      : 0;
    lines.push('');
    lines.push('Context:');
    lines.push(`  Budget: ${budgetPct}% used`);
    lines.push(`  Active: ${metrics.pipeline.activeTasks} pipeline(s)`);
    lines.push(`  System: ${metrics.system.status}`);
  }

  lines.push('─'.repeat(45));
  lines.push(`/approve ${decision.id}`);
  lines.push(`/reject ${decision.id} <reason>`);
  lines.push('```');
  return lines.join('\n');
}

export function renderDecisionsList(
  decisions: ApiDecision[],
  metrics: ApiMetricsResponse | null,
): string {
  if (decisions.length === 0) {
    return 'No pending decisions\\.';
  }

  const sections = decisions.map(d => renderDecisionWithContext(d, metrics));
  return sections.join('\n\n');
}

export async function handleDecisions(ds: DecisionContextDataSource): Promise<string> {
  try {
    const [decisions, metrics] = await Promise.allSettled([
      ds.listPendingDecisions(),
      ds.getMetrics(),
    ]);

    const decisionList = decisions.status === 'fulfilled' ? decisions.value : [];
    const metricsData = metrics.status === 'fulfilled' ? metrics.value : null;

    if (decisions.status === 'rejected') {
      const msg = decisions.reason instanceof Error ? decisions.reason.message : String(decisions.reason);
      return escapeMarkdownV2(`Decisions unavailable: ${msg}`);
    }

    return renderDecisionsList(decisionList, metricsData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return escapeMarkdownV2(`Decisions unavailable: ${msg}`);
  }
}
