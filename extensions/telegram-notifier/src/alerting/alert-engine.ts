/**
 * Alert Engine -- Background polling service for proactive alerts.
 *
 * Periodically fetches metrics and timeline data, evaluates alert rules,
 * and enqueues Telegram notifications with cooldown deduplication.
 *
 * Task 0108 (EP15)
 */

import type { ProductTeamApiClient } from '../api-client.js';
import { AlertCooldown } from './alert-cooldown.js';
import { evaluateAlertRules } from './alert-rules.js';
import type { AlertResult } from './alert-rules.js';

export interface AlertEnqueueFn {
  (text: string, priority: 'high' | 'normal' | 'low'): void;
}

export interface AlertEngineLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface AlertEngineConfig {
  readonly enabled: boolean;
  readonly pollIntervalMs: number;
}

const DEFAULT_CONFIG: AlertEngineConfig = {
  enabled: true,
  pollIntervalMs: 60_000, // 1 minute
};

function formatAlertMessage(alert: AlertResult): string {
  const icon = alert.severity === 'CRITICAL' ? '🔴' : '⚠️';
  return `\`\`\`\n${icon} ${alert.type}\n${'─'.repeat(30)}\n${alert.message}\n\`\`\``;
}

export class AlertEngine {
  private readonly cooldown = new AlertCooldown();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly config: AlertEngineConfig;

  constructor(
    private readonly api: ProductTeamApiClient,
    private readonly enqueue: AlertEnqueueFn,
    private readonly logger: AlertEngineLogger,
    config?: Partial<AlertEngineConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Start the polling loop. */
  start(): void {
    if (!this.config.enabled) {
      this.logger.info('Alert engine disabled by config');
      return;
    }

    this.logger.info('Alert engine started');
    this.timer = setInterval(() => {
      void this.poll();
    }, this.config.pollIntervalMs);
    this.timer.unref();
  }

  /** Stop the polling loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.cooldown.clear();
    this.logger.info('Alert engine stopped');
  }

  /** Single poll iteration -- exposed for testing. */
  async poll(): Promise<void> {
    try {
      const [metrics, timeline] = await Promise.all([
        this.api.getMetrics('hour'),
        this.api.getTimeline(),
      ]);

      const alerts = evaluateAlertRules(metrics, timeline);

      for (const alert of alerts) {
        if (this.cooldown.isInCooldown(alert.key, alert.cooldownMs)) {
          continue;
        }
        this.cooldown.recordFired(alert.key);
        this.enqueue(formatAlertMessage(alert), alert.priority);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Alert poll failed: ${msg}`);
    }
  }

  /** Whether the engine is currently running. */
  get running(): boolean {
    return this.timer !== null;
  }
}
