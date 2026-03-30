/**
 * Daily Standup Summary -- Automated team standup posted to Telegram.
 *
 * Runs once per day (configurable) and posts a summary covering:
 * - Pipeline status (active, completed, blocked)
 * - Agent activity in the last 24 hours
 * - Blocked tasks and quality failures
 * - Budget consumption
 *
 * Task 0145 (EP21)
 */

import { escapeMarkdownV2 } from '../formatting.js';
import type { ApiMetricsResponse, ApiTimelineResponse } from '../api-client.js';

export interface StandupDataSource {
  getMetrics(period: 'hour' | 'day' | 'all'): Promise<ApiMetricsResponse>;
  getTimeline(taskId?: string): Promise<ApiTimelineResponse>;
}

export interface StandupConfig {
  readonly enabled: boolean;
  /** Hour of day to post standup (0-23, UTC). */
  readonly hourUtc: number;
}

export const DEFAULT_STANDUP_CONFIG: StandupConfig = {
  enabled: true,
  hourUtc: 9,
};

/**
 * Format the daily standup summary message.
 *
 * Returns a MarkdownV2-formatted message ready for Telegram.
 */
export function formatStandupSummary(
  metrics: ApiMetricsResponse,
  timeline: ApiTimelineResponse,
): string {
  const lines: string[] = [];
  const eid = escapeMarkdownV2;

  lines.push('📋 *Daily Standup Summary*');
  lines.push(`_${eid(new Date().toISOString().slice(0, 10))}_`);
  lines.push('');

  // System status
  lines.push(`⚙️ *System:* ${eid(metrics.system.status)}`);
  lines.push('');

  // Pipeline status
  const timelines = timeline.timelines ?? [];
  const active = timelines.filter(t => t.currentStage !== 'DONE');
  const completed = timelines.filter(t => t.currentStage === 'DONE');
  const stuckStages = ['IMPLEMENTATION', 'QA', 'REVIEW'];
  const blocked = active.filter(t => stuckStages.includes(t.currentStage));

  lines.push('🔄 *Pipelines:*');
  lines.push(`  Active: ${active.length}`);
  lines.push(`  Completed: ${completed.length}`);
  if (blocked.length > 0) {
    lines.push(`  ⚠️ Possibly stuck: ${blocked.length}`);
  }
  lines.push('');

  // Stage distribution
  const dist = metrics.pipeline.stageDistribution;
  const distEntries = Object.entries(dist).filter(([, count]) => count > 0);
  if (distEntries.length > 0) {
    lines.push('📊 *Stage Distribution:*');
    for (const [stage, count] of distEntries) {
      lines.push(`  ${eid(stage)}: ${count}`);
    }
    lines.push('');
  }

  // Agent activity
  const agentEntries = Object.entries(metrics.agents)
    .filter(([, data]) => data.eventsInPeriod > 0)
    .sort(([, a], [, b]) => b.eventsInPeriod - a.eventsInPeriod);

  if (agentEntries.length > 0) {
    lines.push('🤖 *Agent Activity \\(last 24h\\):*');
    for (const [agentId, data] of agentEntries) {
      lines.push(`  \`${eid(agentId)}\`: ${data.eventsInPeriod} events`);
    }
    lines.push('');
  }

  // Active pipelines detail
  if (active.length > 0) {
    lines.push('📌 *Active Tasks:*');
    for (const t of active.slice(0, 5)) {
      const shortId = t.taskId.length > 10 ? t.taskId.slice(-10) : t.taskId;
      const title = t.title.length > 40 ? t.title.slice(0, 40) + '...' : t.title;
      lines.push(`  • \`${eid(shortId)}\` ${eid(title)} — ${eid(t.currentStage)}`);
    }
    if (active.length > 5) {
      lines.push(`  _\\.\\.\\. and ${active.length - 5} more_`);
    }
    lines.push('');
  }

  // Budget
  const budget = metrics.budget;
  if (budget.globalLimitUsd > 0) {
    const pct = Math.round((budget.globalConsumedUsd / budget.globalLimitUsd) * 100);
    const icon = pct >= 90 ? '🔴' : pct >= 70 ? '🟡' : '🟢';
    lines.push(`💰 *Budget:* ${icon} ${pct}% used \\($${eid(budget.globalConsumedUsd.toFixed(2))} / $${eid(budget.globalLimitUsd.toFixed(2))}\\)`);
  }

  // Token usage
  const totalTokens = metrics.costs.totalTokens;
  if (totalTokens > 0) {
    const formatted = totalTokens > 1_000_000
      ? `${(totalTokens / 1_000_000).toFixed(1)}M`
      : totalTokens > 1_000
        ? `${(totalTokens / 1_000).toFixed(0)}K`
        : String(totalTokens);
    lines.push(`🎫 *Tokens:* ${eid(formatted)} total`);
  }

  return lines.join('\n');
}

/**
 * StandupScheduler -- Manages daily standup posting.
 *
 * Uses a simple interval-based check rather than cron to avoid
 * external dependencies. Checks every 15 minutes if it's time
 * for the daily standup.
 */
export class StandupScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPostedDate: string | null = null;
  private readonly config: StandupConfig;

  constructor(
    private readonly dataSource: StandupDataSource,
    private readonly enqueue: (text: string, priority: 'high' | 'normal' | 'low') => void,
    private readonly logger: { info(msg: string): void; warn(msg: string): void },
    config?: Partial<StandupConfig>,
  ) {
    this.config = { ...DEFAULT_STANDUP_CONFIG, ...config };
  }

  start(): void {
    if (!this.config.enabled) {
      this.logger.info('Standup scheduler disabled');
      return;
    }

    this.logger.info(`Standup scheduler started (hour=${this.config.hourUtc} UTC)`);
    this.timer = setInterval(() => {
      void this.check();
    }, 15 * 60 * 1000); // Check every 15 minutes
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Check if it's time for standup and post if so. Exposed for testing. */
  async check(now?: Date): Promise<boolean> {
    const current = now ?? new Date();
    const today = current.toISOString().slice(0, 10);

    // Already posted today
    if (this.lastPostedDate === today) return false;

    // Not the right hour yet
    if (current.getUTCHours() < this.config.hourUtc) return false;

    try {
      const [metrics, timeline] = await Promise.all([
        this.dataSource.getMetrics('day'),
        this.dataSource.getTimeline(),
      ]);

      const message = formatStandupSummary(metrics, timeline);
      this.enqueue(message, 'normal');
      this.lastPostedDate = today;
      this.logger.info(`Daily standup posted for ${today}`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Standup post failed: ${msg}`);
      return false;
    }
  }

  get running(): boolean {
    return this.timer !== null;
  }
}
