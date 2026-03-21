/**
 * /teamstatus Command -- Live agent dashboard for Telegram.
 *
 * Shows all 8 agents with their current status, task, pipeline stage,
 * and last activity time.
 *
 * Task 0104 (EP15)
 */

import { escapeMarkdownV2 } from '../formatting.js';
import type { ApiMetricsResponse, ApiTimelineResponse } from '../api-client.js';

const AGENT_ORDER = ['pm', 'tech-lead', 'po', 'designer', 'back-1', 'front-1', 'qa', 'devops'];

/** Data source abstraction for testability. */
export interface TeamStatusDataSource {
  getMetrics(): Promise<ApiMetricsResponse>;
  getTimeline(): Promise<ApiTimelineResponse>;
}

interface AgentRow {
  readonly id: string;
  readonly active: boolean;
  readonly taskId: string;
  readonly stage: string;
  readonly lastActivity: string;
}

function formatRelativeTime(eventsInPeriod: number): string {
  if (eventsInPeriod > 10) return 'now';
  if (eventsInPeriod > 0) return 'recent';
  return 'idle';
}

function buildAgentRows(
  metrics: ApiMetricsResponse,
  timeline: ApiTimelineResponse,
): AgentRow[] {
  const activeTimelines = timeline.timelines ?? [];

  return AGENT_ORDER.map(id => {
    const agentMetrics = metrics.agents[id];
    const active = agentMetrics ? agentMetrics.eventsInPeriod > 0 : false;

    // Find if this agent owns any active stage
    let taskId = '--';
    let stage = '--';
    for (const t of activeTimelines) {
      for (const s of t.stages) {
        if (s.agentId === id && s.enteredAt && !s.completedAt) {
          taskId = t.taskId.length > 8 ? t.taskId.slice(-8) : t.taskId;
          stage = s.stage;
          break;
        }
      }
    }

    return {
      id,
      active,
      taskId,
      stage,
      lastActivity: formatRelativeTime(agentMetrics?.eventsInPeriod ?? 0),
    };
  });
}

export function renderTeamStatus(
  metrics: ApiMetricsResponse,
  timeline: ApiTimelineResponse,
): string {
  const rows = buildAgentRows(metrics, timeline);

  const budgetPct = metrics.budget.globalLimitUsd > 0
    ? Math.round((metrics.budget.globalConsumedUsd / metrics.budget.globalLimitUsd) * 100)
    : 0;

  const lines: string[] = [];
  lines.push('```');
  lines.push('Team Status');
  lines.push('─'.repeat(60));

  for (const row of rows) {
    const icon = row.active ? 'ON ' : 'off';
    const padId = row.id.padEnd(10);
    const padTask = row.taskId.padEnd(10);
    const padStage = row.stage.padEnd(15);
    lines.push(`${icon} ${padId}${padTask}${padStage}${row.lastActivity}`);
  }

  lines.push('─'.repeat(60));
  lines.push(
    `Active: ${metrics.pipeline.activeTasks} | Budget: ${budgetPct}%`,
  );
  lines.push('```');

  return lines.join('\n');
}

export async function handleTeamStatus(ds: TeamStatusDataSource): Promise<string> {
  try {
    const [metrics, timeline] = await Promise.all([
      ds.getMetrics(),
      ds.getTimeline(),
    ]);
    return renderTeamStatus(metrics, timeline);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return escapeMarkdownV2(`Team status unavailable: ${msg}`);
  }
}
