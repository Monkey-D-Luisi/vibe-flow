import type { SqliteEventRepository } from '../persistence/event-repository.js';
import type { HealthCheckDeps, HealthCheckResult } from './health-check.js';
import { getHealthStatus } from './health-check.js';
import { buildCostSummary } from '../cost/cost-summary.js';

interface Logger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

export interface MonitoringCronDeps {
  readonly healthCheckDeps: HealthCheckDeps;
  readonly eventRepo: SqliteEventRepository;
  readonly logger: Logger;
  readonly telegramChatId?: string;
}

interface TelegramConfig {
  readonly botToken: string;
  readonly chatId: string;
}

const HEALTH_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const ACTIVITY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const COST_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

function resolveTelegramConfig(deps: MonitoringCronDeps): TelegramConfig | null {
  const token = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
  const chatId = deps.telegramChatId ?? process.env['TELEGRAM_CHAT_ID'] ?? '';
  if (!token.trim() || !chatId.trim()) {
    return null;
  }
  return { botToken: token.trim(), chatId: chatId.trim() };
}

async function postTelegram(config: TelegramConfig, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: 'Markdown',
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Telegram API error ${response.status}: ${body}`);
  }
}

function formatHealthMessage(result: HealthCheckResult): string {
  const icon = result.status === 'ok' ? '✅' : result.status === 'degraded' ? '⚠️' : '🔴';
  const lines = [
    `${icon} *OpenClaw Health: ${result.status.toUpperCase()}*`,
    '',
    `• Gateway: ${result.checks.gateway ? 'ok' : 'down'}`,
    `• Database: ${result.checks.database ? 'ok' : 'down'}`,
    `• LLM Provider: ${result.checks.llmProvider ? 'connected' : 'not configured'}`,
    `• Telegram: ${result.checks.telegram ? 'connected' : 'not configured'}`,
    `• Event Log: ${result.checks.eventLog ? 'writable' : 'error'}`,
    '',
    `_${result.timestamp}_`,
  ];
  return lines.join('\n');
}

function formatActivityMessage(agentActivity: Record<string, number>): string {
  const entries = Object.entries(agentActivity)
    .sort(([, a], [, b]) => b - a)
    .map(([agent, count]) => `  • ${agent}: ${count} events`);

  const lines = [
    '📊 *Agent Activity (last hour)*',
    '',
    ...(entries.length > 0 ? entries : ['  _No activity recorded_']),
    '',
    `_${new Date().toISOString()}_`,
  ];
  return lines.join('\n');
}

function formatCostMessage(
  totalTokens: number,
  totalDurationMs: number,
  eventCount: number,
): string {
  const durationSec = (totalDurationMs / 1000).toFixed(1);
  const lines = [
    '💰 *Daily Cost Summary*',
    '',
    `• Total tokens: ${totalTokens.toLocaleString()}`,
    `• Total LLM duration: ${durationSec}s`,
    `• Cost events: ${eventCount}`,
    '',
    `_${new Date().toISOString()}_`,
  ];
  return lines.join('\n');
}

export class MonitoringCron {
  private readonly timers: ReturnType<typeof setInterval>[] = [];

  constructor(private readonly deps: MonitoringCronDeps) {}

  start(): void {
    // Every 5 minutes: health check alert when degraded or down
    this.timers.push(
      setInterval(() => {
        void this.runHealthCheck();
      }, HEALTH_INTERVAL_MS).unref(),
    );

    // Every hour: agent activity summary
    this.timers.push(
      setInterval(() => {
        void this.runActivitySummary();
      }, ACTIVITY_INTERVAL_MS).unref(),
    );

    // Every day: cost summary
    this.timers.push(
      setInterval(() => {
        void this.runCostSummary();
      }, COST_INTERVAL_MS).unref(),
    );

    this.deps.logger.info('monitoring-cron: started');
  }

  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers.length = 0;
    this.deps.logger.info('monitoring-cron: stopped');
  }

  private async runHealthCheck(): Promise<void> {
    const config = resolveTelegramConfig(this.deps);
    if (!config) {
      return;
    }

    const result = getHealthStatus(this.deps.healthCheckDeps);
    if (result.status === 'ok') {
      return; // Only alert when degraded or down
    }

    try {
      await postTelegram(config, formatHealthMessage(result));
    } catch (err: unknown) {
      this.deps.logger.warn(`monitoring-cron: health check alert failed: ${String(err)}`);
    }
  }

  private async runActivitySummary(): Promise<void> {
    const config = resolveTelegramConfig(this.deps);
    if (!config) {
      return;
    }

    try {
      const since = new Date(Date.now() - ACTIVITY_INTERVAL_MS).toISOString();
      const result = this.deps.eventRepo.queryEvents({
        since,
        limit: 1000,
        offset: 0,
      });

      await postTelegram(
        config,
        formatActivityMessage(result.aggregates.byAgent),
      );
    } catch (err: unknown) {
      this.deps.logger.warn(`monitoring-cron: activity summary failed: ${String(err)}`);
    }
  }

  private async runCostSummary(): Promise<void> {
    const config = resolveTelegramConfig(this.deps);
    if (!config) {
      return;
    }

    try {
      const since = new Date(Date.now() - COST_INTERVAL_MS).toISOString();
      const result = this.deps.eventRepo.queryEvents({
        since,
        limit: 5000,
        offset: 0,
      });

      const summary = buildCostSummary(result.events);
      await postTelegram(
        config,
        formatCostMessage(summary.totalTokens, summary.totalDurationMs, summary.eventCount),
      );
    } catch (err: unknown) {
      this.deps.logger.warn(`monitoring-cron: cost summary failed: ${String(err)}`);
    }
  }
}
