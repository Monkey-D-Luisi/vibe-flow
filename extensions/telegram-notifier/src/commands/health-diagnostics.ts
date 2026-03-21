/**
 * /health Command -- Real-time system diagnostics for Telegram.
 *
 * Shows gateway status, pipeline throughput, agent activity summary,
 * budget status, and token usage.
 *
 * Task 0105 (EP15)
 */

import { escapeMarkdownV2 } from '../formatting.js';
import type { ApiMetricsResponse } from '../api-client.js';

/** Data source abstraction for testability. */
export interface HealthDataSource {
  getMetrics(): Promise<ApiMetricsResponse>;
}

export function renderHealthDashboard(metrics: ApiMetricsResponse): string {
  const activeAgents = Object.values(metrics.agents).filter(a => a.eventsInPeriod > 0).length;
  const totalAgents = Object.keys(metrics.agents).length || 8;

  const budgetPct = metrics.budget.globalLimitUsd > 0
    ? Math.round((metrics.budget.globalConsumedUsd / metrics.budget.globalLimitUsd) * 100)
    : 0;

  const tokenPct = metrics.budget.globalLimitTokens > 0
    ? Math.round((metrics.budget.globalConsumedTokens / metrics.budget.globalLimitTokens) * 100)
    : 0;

  const lines: string[] = [];
  lines.push('```');
  lines.push('System Health');
  lines.push('─'.repeat(40));

  lines.push(`Gateway:   ${metrics.system.status === 'healthy' ? 'OK' : metrics.system.status}`);
  lines.push(`Pipelines: ${metrics.system.activePipelines} active`);
  lines.push(`Agents:    ${activeAgents}/${totalAgents} active`);
  lines.push('');
  lines.push(`Budget:    ${budgetPct}% ($${metrics.budget.globalConsumedUsd.toFixed(2)} / $${metrics.budget.globalLimitUsd.toFixed(2)})`);
  lines.push(`Tokens:    ${tokenPct}% (${metrics.budget.globalConsumedTokens.toLocaleString()} / ${metrics.budget.globalLimitTokens.toLocaleString()})`);
  lines.push(`Cost:      ${metrics.costs.totalTokens.toLocaleString()} total tokens`);

  // Stage distribution summary
  const stages = metrics.pipeline.stageDistribution;
  if (Object.keys(stages).length > 0) {
    lines.push('');
    lines.push('Stage Distribution:');
    for (const [stage, count] of Object.entries(stages)) {
      lines.push(`  ${stage.padEnd(15)}${count}`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}

export async function handleHealth(ds: HealthDataSource): Promise<string> {
  try {
    const metrics = await ds.getMetrics();
    return renderHealthDashboard(metrics);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return escapeMarkdownV2(`Health check unavailable: ${msg}`);
  }
}
