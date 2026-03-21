/**
 * Alert Rules -- Pure functions evaluating alert conditions.
 *
 * Each rule takes metrics/timeline data and returns an AlertResult or null.
 * Rules are stateless -- cooldown and deduplication handled by the engine.
 *
 * Task 0108 (EP15)
 */

import type { ApiMetricsResponse, ApiTimelineResponse, ApiStageEntry } from '../api-client.js';

export type AlertSeverity = 'WARNING' | 'CRITICAL';
export type AlertPriority = 'high' | 'normal' | 'low';

export interface AlertResult {
  readonly type: string;
  readonly severity: AlertSeverity;
  readonly priority: AlertPriority;
  readonly key: string;
  readonly cooldownMs: number;
  readonly message: string;
}

// --- Alert type constants ---
const COOLDOWN_5M = 300_000;
const COOLDOWN_10M = 600_000;
const COOLDOWN_15M = 900_000;

/** Check if budget consumption exceeds warning threshold. */
export function checkBudgetWarning(metrics: ApiMetricsResponse): AlertResult | null {
  const { globalConsumedUsd, globalLimitUsd } = metrics.budget;
  if (globalLimitUsd <= 0) return null;
  const pct = globalConsumedUsd / globalLimitUsd;
  if (pct < 0.8) return null;

  const severity: AlertSeverity = pct >= 0.95 ? 'CRITICAL' : 'WARNING';
  return {
    type: 'BUDGET_WARNING',
    severity,
    priority: severity === 'CRITICAL' ? 'high' : 'normal',
    key: 'budget_warning',
    cooldownMs: COOLDOWN_10M,
    message: [
      `Budget ${severity === 'CRITICAL' ? 'CRITICAL' : 'Warning'}`,
      `Usage: ${Math.round(pct * 100)}% ($${globalConsumedUsd.toFixed(2)} / $${globalLimitUsd.toFixed(2)})`,
    ].join('\n'),
  };
}

/** Check for stalled pipelines (no stage transitions recently). */
export function checkPipelineStalled(
  timeline: ApiTimelineResponse,
  now: number = Date.now(),
): AlertResult | null {
  const timelines = timeline.timelines ?? [];
  for (const t of timelines) {
    const active = t.stages.find((s: ApiStageEntry) => s.enteredAt && !s.completedAt);
    if (!active?.enteredAt) continue;

    const enteredAt = new Date(active.enteredAt).getTime();
    const elapsed = now - enteredAt;
    const stallThreshold = 15 * 60 * 1000; // 15 minutes

    if (elapsed > stallThreshold) {
      return {
        type: 'PIPELINE_STALLED',
        severity: 'CRITICAL',
        priority: 'high',
        key: `pipeline_stalled:${t.taskId}:${active.stage}`,
        cooldownMs: COOLDOWN_15M,
        message: [
          `Pipeline Stalled`,
          `Task: ${t.taskId.slice(-12)}`,
          `Stage: ${active.stage} (${active.agentId ?? 'unknown'})`,
          `Duration: ${Math.round(elapsed / 60000)}m (threshold: 15m)`,
        ].join('\n'),
      };
    }
  }
  return null;
}

/** Check system health status. */
export function checkSystemHealth(metrics: ApiMetricsResponse): AlertResult | null {
  if (metrics.system.status === 'healthy') return null;

  return {
    type: 'SYSTEM_DEGRADED',
    severity: metrics.system.status === 'down' ? 'CRITICAL' : 'WARNING',
    priority: 'high',
    key: 'system_health',
    cooldownMs: COOLDOWN_5M,
    message: [
      `System ${metrics.system.status === 'down' ? 'DOWN' : 'Degraded'}`,
      `Status: ${metrics.system.status}`,
    ].join('\n'),
  };
}

/** Check if no agents have had activity recently. */
export function checkAgentInactivity(metrics: ApiMetricsResponse): AlertResult | null {
  const agentEntries = Object.entries(metrics.agents);
  if (agentEntries.length === 0) return null;

  const activeCount = agentEntries.filter(([, a]) => a.eventsInPeriod > 0).length;

  // Only alert if there are active pipelines but zero agent activity
  if (metrics.pipeline.activeTasks > 0 && activeCount === 0) {
    return {
      type: 'AGENT_INACTIVITY',
      severity: 'WARNING',
      priority: 'normal',
      key: 'agent_inactivity',
      cooldownMs: COOLDOWN_10M,
      message: [
        `No Agent Activity`,
        `Active pipelines: ${metrics.pipeline.activeTasks}`,
        `Active agents: 0/${agentEntries.length}`,
      ].join('\n'),
    };
  }
  return null;
}

/** Evaluate all alert rules against current data. */
export function evaluateAlertRules(
  metrics: ApiMetricsResponse,
  timeline: ApiTimelineResponse,
  now: number = Date.now(),
): AlertResult[] {
  const results: AlertResult[] = [];

  const budget = checkBudgetWarning(metrics);
  if (budget) results.push(budget);

  const stalled = checkPipelineStalled(timeline, now);
  if (stalled) results.push(stalled);

  const health = checkSystemHealth(metrics);
  if (health) results.push(health);

  const inactivity = checkAgentInactivity(metrics);
  if (inactivity) results.push(inactivity);

  return results;
}
