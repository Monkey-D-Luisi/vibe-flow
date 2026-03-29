import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import {
  escapeMarkdownV2,
  formatTaskTransition,
  formatPrCreation,
  formatQualityGate,
  formatAgentError,
  formatPipelineAdvance,
  formatPipelineComplete,
} from './formatting.js';
import { handleBudgetCommand, type BudgetDataSource, type BudgetRecord } from './budget-dashboard.js';
import { createApiClient } from './api-client.js';
import { handleTeamStatus } from './commands/team-status.js';
import { handleHealth } from './commands/health-diagnostics.js';
import { handlePipeline } from './commands/pipeline-view.js';
import { handleDecisions } from './commands/decision-context.js';
import { AlertEngine } from './alerting/alert-engine.js';
import { StandupScheduler } from './standup/daily-standup.js';
import { extractDecisionData, formatDecisionCard, buildDecisionButtons } from './decision-buttons.js';
import {
  trackPipeline,
  getTrackedPipeline,
  updateTrackedStage,
  formatPipelineProgress,
} from './pipeline-tracker.js';

/**
 * Telegram Notifier Plugin
 *
 * Bridges agent lifecycle events (task transitions, PR creation, quality gates,
 * errors) to a configured Telegram group. Accepts human commands from the group
 * to control the autonomous team.
 */

interface NotifierConfig {
  groupId: string;
  rateLimit: {
    maxPerMinute: number;
  };
}

interface QueuedMessage {
  text: string;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
  buttons?: ReadonlyArray<ReadonlyArray<{ text: string; callback_data: string }>>;
}

const MESSAGE_QUEUE: QueuedMessage[] = [];
let flushInterval: ReturnType<typeof setInterval> | null = null;

function getConfig(api: OpenClawPluginApi): NotifierConfig {
  const cfg = (api.pluginConfig && typeof api.pluginConfig === 'object')
    ? (api.pluginConfig as Record<string, unknown>)
    : {};
  const rawRateLimit = (cfg['rateLimit'] && typeof cfg['rateLimit'] === 'object')
    ? (cfg['rateLimit'] as Record<string, unknown>)
    : {};
  const parsedMaxPerMinute = Number(rawRateLimit['maxPerMinute']);
  return {
    groupId: String(cfg['groupId'] ?? ''),
    rateLimit: {
      maxPerMinute: Number.isFinite(parsedMaxPerMinute) && parsedMaxPerMinute > 0
        ? parsedMaxPerMinute
        : 20,
    },
  };
}

function enqueue(text: string, priority: 'high' | 'normal' | 'low'): void {
  MESSAGE_QUEUE.push({ text, priority, timestamp: Date.now() });
}

function enqueueWithButtons(
  text: string,
  priority: 'high' | 'normal' | 'low',
  buttons: ReadonlyArray<ReadonlyArray<{ text: string; callback_data: string }>>,
): void {
  MESSAGE_QUEUE.push({ text, priority, timestamp: Date.now(), buttons });
}

export default {
  id: 'telegram-notifier',
  name: 'Telegram Team Notifier',
  description: 'Bridges agent lifecycle events to Telegram; accepts team commands',

  register(api: OpenClawPluginApi) {
    const config = getConfig(api);
    const logger = api.logger;
    const slog = (level: 'info' | 'warn' | 'error', op: string, ctx?: Record<string, unknown>) =>
      logger[level](JSON.stringify({ ts: new Date().toISOString(), level, ext: 'telegram-notifier', op, ...ctx }));

    if (!config.groupId) {
      slog('warn', 'config.missing_group_id');
      return;
    }

    // EP13 Task 0096: Create API client for product-team HTTP routes (replaces _sharedDb)
    const rawApiPort = process.env['OPENCLAW_GATEWAY_PORT'];
    const parsedApiPort = Number.parseInt(rawApiPort ?? '', 10);
    const apiPort = Number.isFinite(parsedApiPort) && parsedApiPort > 0 ? parsedApiPort : 28789;
    const ptApi = createApiClient(apiPort);

    // ── Lifecycle Hooks ──

    api.on('after_tool_call', (event) => {
      const toolName = String(event.toolName ?? '');
      const params = (event.params ?? {}) as Record<string, unknown>;
      const result = event.result;

      if (toolName === 'task_transition') {
        enqueue(formatTaskTransition(params), 'normal');
      } else if (toolName === 'vcs_pr_create') {
        enqueue(formatPrCreation(params, result), 'high');
      } else if (toolName === 'quality_gate') {
        enqueue(formatQualityGate(params, result), 'normal');
      } else if (toolName === 'decision_evaluate') {
        // EP21 Task 0142: Rich decision card with inline keyboard buttons
        const res = (result && typeof result === 'object') ? result as Record<string, unknown> : {};
        const cardData = extractDecisionData(params, res);
        if (cardData && cardData.approver !== 'human') {
          const text = formatDecisionCard(cardData);
          const buttons = buildDecisionButtons(cardData.decisionId, cardData.options);
          enqueueWithButtons(text, 'high', buttons);
        }
      } else if (toolName === 'pipeline_advance') {
        const res = (result && typeof result === 'object')
          ? (result as Record<string, unknown>)
          : {};
        const details = ((res['details'] ?? res) as Record<string, unknown>);
        if (details['advanced'] === true) {
          const taskId = String(details['taskId'] ?? 'unknown');
          const previousStage = String(details['previousStage'] ?? '');
          const currentStage = String(details['currentStage'] ?? '');
          const title = String(details['title'] ?? '');

          // EP21 Task 0143: Live pipeline tracker -- single message, edited in-place
          const tracked = getTrackedPipeline(taskId);
          if (tracked) {
            // Update existing tracked pipeline and edit the message
            const updated = updateTrackedStage(taskId, previousStage, currentStage);
            if (updated) {
              const text = formatPipelineProgress(updated);
              const ma = api.runtime?.channel?.telegram?.messageActions;
              if (ma?.handleAction) {
                Promise.resolve(ma.handleAction({
                  channel: 'telegram' as never,
                  action: 'edit' as never,
                  cfg: api.config,
                  params: {
                    chatId: updated.chatId,
                    messageId: Number(updated.messageId),
                    message: text,
                  },
                })).catch((err: unknown) => {
                  slog('warn', 'pipeline_tracker.edit_failed', { taskId, err: String(err) });
                  // Fallback: send a new message
                  enqueue(currentStage === 'DONE'
                    ? formatPipelineComplete(details)
                    : formatPipelineAdvance(details), 'normal');
                });
              }
            }
          } else {
            // First advance for this task: send initial tracker message
            const runtime = api.runtime;
            const sendTg = runtime?.channel?.telegram?.sendMessageTelegram;
            if (typeof sendTg === 'function') {
              // Create a temporary tracked entry so formatPipelineProgress works
              trackPipeline(taskId, config.groupId, '0', title, currentStage);
              const tempTracked = getTrackedPipeline(taskId);
              if (tempTracked && previousStage) {
                tempTracked.completedStages.add(previousStage);
              }
              const text = tempTracked
                ? formatPipelineProgress(tempTracked)
                : formatPipelineAdvance(details);
              Promise.resolve(sendTg(config.groupId, text, {
                textMode: 'markdown',
              })).then((sent: unknown) => {
                const sendResult = sent as { messageId?: string; chatId?: string } | undefined;
                const msgId = String(sendResult?.messageId ?? '0');
                const chatId = String(sendResult?.chatId ?? config.groupId);
                // Re-track with actual messageId from Telegram
                trackPipeline(taskId, chatId, msgId, title, currentStage);
                if (previousStage) {
                  const t = getTrackedPipeline(taskId);
                  if (t) t.completedStages.add(previousStage);
                }
              }).catch((err: unknown) => {
                slog('warn', 'pipeline_tracker.send_failed', { taskId, err: String(err) });
              });
            } else {
              // No Telegram runtime, fall back to queue
              enqueue(currentStage === 'DONE'
                ? formatPipelineComplete(details)
                : formatPipelineAdvance(details), 'normal');
            }
          }
        }
      }
    });

    api.on('agent_end', (event) => {
      if (event.error) {
        enqueue(formatAgentError(event as unknown as Record<string, unknown>), 'high');
      }
    });

    api.on('subagent_spawned', (event) => {
      const agentId = String((event as Record<string, unknown>)['agentId'] ?? 'unknown');
      enqueue(
        `🤖 Sub\\-agent \`${escapeMarkdownV2(agentId)}\` spawned`,
        'low',
      );
    });

    // ── Slash Commands ──
    // Handler signature: (ctx: PluginCommandContext) => PluginCommandResult

    api.registerCommand({
      name: 'teamstatus',
      description: 'Live agent dashboard with status, task, and pipeline stage',
      acceptsArgs: false,
      handler: async () => {
        try {
          const text = await handleTeamStatus({
            getMetrics: () => ptApi.getMetrics('hour'),
            getTimeline: () => ptApi.getTimeline(),
          });
          return { text };
        } catch (err: unknown) {
          logger.warn(`telegram-notifier: /teamstatus failed: ${String(err)}`);
          return { text: `Team status unavailable: ${escapeMarkdownV2(String(err))}` };
        }
      },
    });

    api.registerCommand({
      name: 'idea',
      description: 'Submit a product idea to the PM agent',
      acceptsArgs: true,
      handler: async (ctx) => {
        const ideaText = String(ctx.args ?? '').trim();
        if (!ideaText) {
          return { text: 'Usage: /idea <your product idea>\n\nTip: You can also send a regular message \\(not a command\\) to talk directly with the PM agent\\.' };
        }
        return { text: `Idea noted: "${escapeMarkdownV2(ideaText)}"\\.\n\nTo have the PM agent act on this, send it as a regular message \\(not a /command\\)\\. Example:\n\`@AiProductTeamBot ${escapeMarkdownV2(ideaText)}\`` };
      },
    });

    api.registerCommand({
      name: 'health',
      description: 'System health diagnostics',
      handler: async () => {
        try {
          const text = await handleHealth({
            getMetrics: () => ptApi.getMetrics('day'),
          });
          return { text };
        } catch (err: unknown) {
          logger.warn(`telegram-notifier: /health failed: ${String(err)}`);
          return { text: `Health check unavailable: ${escapeMarkdownV2(String(err))}` };
        }
      },
    });

    // EP11 Task 0087: Real-time budget dashboard
    api.registerCommand({
      name: 'pipeline',
      description: 'Pipeline visualization with stage progression',
      acceptsArgs: true,
      handler: async (ctx) => {
        try {
          const args = String(ctx.args ?? '').trim() || undefined;
          const text = await handlePipeline({
            getTimeline: (taskId) => ptApi.getTimeline(taskId),
          }, args);
          return { text };
        } catch (err: unknown) {
          logger.warn(`telegram-notifier: /pipeline failed: ${String(err)}`);
          return { text: `Pipeline view unavailable: ${escapeMarkdownV2(String(err))}` };
        }
      },
    });

    // EP11 Task 0087: Real-time budget dashboard
    api.registerCommand({
      name: 'budget',
      description: 'Real-time budget dashboard with replenish/reset commands',
      acceptsArgs: true,
      handler: async (ctx) => {
        try {
          const args = String(ctx.args ?? '').trim();

          // EP13 Task 0096: Prefetch all budget data via API, then provide sync data source
          const allScopes = ['global', 'pipeline', 'stage', 'agent'] as const;
          const budgetMap = new Map<string, BudgetRecord[]>();
          for (const scope of allScopes) {
            const records = await ptApi.listBudgetByScope(scope);
            budgetMap.set(scope, records.map((r) => ({
              id: r.id, scope: r.scope, scopeId: r.scopeId ?? '',
              limitTokens: r.limitTokens, consumedTokens: r.consumedTokens,
              limitUsd: r.limitUsd, consumedUsd: r.consumedUsd,
              status: r.status, warningThreshold: r.warningThreshold ?? 0.8, rev: r.rev,
            })));
          }

          // For replenish/reset subcommands, prefetch the mutation target and execute
          const parts = args.trim().split(/\s+/);
          const sub = parts[0]?.toLowerCase() ?? '';
          let mutationResult: BudgetRecord | null = null;
          let mutationScope = '';
          let mutationScopeId = '';

          if (sub === 'replenish' && parts.length >= 4) {
            mutationScope = parts[1]!;
            mutationScopeId = parts[2]!;
            const amount = Number(parts[3]!);
            const source = (budgetMap.get(mutationScope) ?? []).find((r) => r.scopeId === mutationScopeId);
            if (source && Number.isFinite(amount) && Number.isInteger(amount) && amount > 0) {
              const updated = await ptApi.replenishBudget(source.id, amount, 0, source.rev, new Date().toISOString());
              mutationResult = {
                id: updated.id, scope: updated.scope, scopeId: updated.scopeId ?? '',
                limitTokens: updated.limitTokens, consumedTokens: updated.consumedTokens,
                limitUsd: updated.limitUsd, consumedUsd: updated.consumedUsd,
                status: updated.status, warningThreshold: updated.warningThreshold ?? 0.8, rev: updated.rev,
              };
            }
          } else if (sub === 'reset' && parts.length >= 3 && parts[1]?.toLowerCase() === 'agent') {
            mutationScope = 'agent';
            mutationScopeId = parts[2]!;
            const source = (budgetMap.get('agent') ?? []).find((r) => r.scopeId === mutationScopeId);
            if (source) {
              const updated = await ptApi.resetBudgetConsumption(source.id, source.rev, new Date().toISOString());
              mutationResult = {
                id: updated.id, scope: updated.scope, scopeId: updated.scopeId ?? '',
                limitTokens: updated.limitTokens, consumedTokens: updated.consumedTokens,
                limitUsd: updated.limitUsd, consumedUsd: updated.consumedUsd,
                status: updated.status, warningThreshold: updated.warningThreshold ?? 0.8, rev: updated.rev,
              };
            }
          }

          const ds: BudgetDataSource = {
            getByScope(scope: string, scopeId: string) {
              if (mutationResult && scope === mutationScope && scopeId === mutationScopeId) {
                return mutationResult;
              }
              return (budgetMap.get(scope) ?? []).find((r) => r.scopeId === scopeId) ?? null;
            },
            listByScope(scope: string) {
              return budgetMap.get(scope) ?? [];
            },
            replenish(_id, _at, _au, _er, _now) {
              if (mutationResult) return mutationResult;
              throw new Error('Mutation not available');
            },
            resetConsumption(_id, _er, _now) {
              if (mutationResult) return mutationResult;
              throw new Error('Mutation not available');
            },
          };

          return handleBudgetCommand(args, ds, () => new Date().toISOString());
        } catch (err: unknown) {
          logger.warn(`telegram-notifier: /budget failed: ${String(err)}`);
          return { text: `\u26A0\uFE0F Budget command failed: ${escapeMarkdownV2(String(err))}` };
        }
      },
    });

    // EP09 Task 0076: Decision approval commands from Telegram
    api.registerCommand({
      name: 'approve',
      description: 'Approve a pending escalated decision',
      acceptsArgs: true,
      handler: async (ctx) => {
        const args = String(ctx.args ?? '').trim();
        const parts = args.split(/\s+/);
        const decisionId = parts[0] ?? '';
        const choice = parts[1] ?? '';

        if (!decisionId || !choice) {
          return { text: 'Usage: /approve <decisionId> <optionId>\n\nExample: /approve DEC\\_001 option\\-a' };
        }

        try {
          // EP13 Task 0096: Use API client instead of _sharedDb
          const result = await ptApi.approveDecision(decisionId, choice);
          if (result.approved) {
            return { text: `\u2705 Decision \`${escapeMarkdownV2(decisionId)}\` approved with choice \`${escapeMarkdownV2(choice)}\`\\.` };
          }
          return { text: `\u26A0\uFE0F Unexpected response from approval API\\.` };
        } catch (err: unknown) {
          const msg = String(err);
          if (msg.includes('not found')) {
            return { text: `\u274C Decision \`${escapeMarkdownV2(decisionId)}\` not found\\.` };
          }
          if (msg.includes('already resolved')) {
            return { text: `\u2139\uFE0F Decision \`${escapeMarkdownV2(decisionId)}\` already resolved\\.` };
          }
          logger.warn(`telegram-notifier: /approve failed: ${msg}`);
          return { text: `\u26A0\uFE0F Failed to process approval: ${escapeMarkdownV2(msg)}` };
        }
      },
    });

    api.registerCommand({
      name: 'reject',
      description: 'Reject a pending escalated decision and re-escalate',
      acceptsArgs: true,
      handler: async (ctx) => {
        const args = String(ctx.args ?? '').trim();
        const parts = args.split(/\s+/);
        const decisionId = parts[0] ?? '';
        const reason = parts.slice(1).join(' ') || 'Rejected via Telegram';

        if (!decisionId) {
          return { text: 'Usage: /reject <decisionId> \\[reason\\]' };
        }

        try {
          // EP13 Task 0096: Use API client instead of _sharedDb
          const result = await ptApi.rejectDecision(decisionId, reason);
          if (result.rejected) {
            return { text: `\uD83D\uDD04 Decision \`${escapeMarkdownV2(decisionId)}\` rejected and re\\-escalated to tech\\-lead\\.` };
          }
          return { text: `\u26A0\uFE0F Unexpected response from rejection API\\.` };
        } catch (err: unknown) {
          const msg = String(err);
          if (msg.includes('not found')) {
            return { text: `\u274C Decision \`${escapeMarkdownV2(decisionId)}\` not found\\.` };
          }
          if (msg.includes('already resolved')) {
            return { text: `\u2139\uFE0F Decision \`${escapeMarkdownV2(decisionId)}\` already resolved\\.` };
          }
          logger.warn(`telegram-notifier: /reject failed: ${msg}`);
          return { text: `\u26A0\uFE0F Failed to process rejection: ${escapeMarkdownV2(msg)}` };
        }
      },
    });

    api.registerCommand({
      name: 'decisions',
      description: 'List pending decisions with budget context',
      handler: async () => {
        try {
          const text = await handleDecisions({
            listPendingDecisions: () => ptApi.listPendingDecisions(),
            getMetrics: () => ptApi.getMetrics('hour'),
          });
          return { text };
        } catch (err: unknown) {
          logger.warn(`telegram-notifier: /decisions failed: ${String(err)}`);
          return { text: `Decisions unavailable: ${escapeMarkdownV2(String(err))}` };
        }
      },
    });

    // ── Alert Engine Service (EP15 Task 0108) ──

    const pluginCfg = (api.pluginConfig && typeof api.pluginConfig === 'object')
      ? (api.pluginConfig as Record<string, unknown>)
      : {};
    const rawAlertingCfg = (pluginCfg['alerting'] && typeof pluginCfg['alerting'] === 'object')
      ? (pluginCfg['alerting'] as Record<string, unknown>)
      : {};
    const alertingEnabled = rawAlertingCfg['enabled'] === true || rawAlertingCfg['enabled'] === 'true';
    const alertLogger = { info: slog.bind(null, 'info'), warn: slog.bind(null, 'warn'), error: slog.bind(null, 'error') };
    const alertEngine = new AlertEngine(ptApi, enqueue, alertLogger, {
      enabled: alertingEnabled,
      pollIntervalMs: 60_000,
    });

    api.registerService({
      id: 'telegram-notifier-alerting',
      async start() {
        alertEngine.start();
      },
      async stop() {
        alertEngine.stop();
      },
    });

    // ── Daily Standup Scheduler (EP21 Task 0145) ──

    const rawStandupCfg = (pluginCfg['standup'] && typeof pluginCfg['standup'] === 'object')
      ? (pluginCfg['standup'] as Record<string, unknown>)
      : {};
    const standupEnabled = rawStandupCfg['enabled'] === true || rawStandupCfg['enabled'] === 'true';
    const standupHour = typeof rawStandupCfg['hourUtc'] === 'number' ? rawStandupCfg['hourUtc'] : 9;
    const standupScheduler = new StandupScheduler(ptApi, enqueue, alertLogger, {
      enabled: standupEnabled,
      hourUtc: standupHour,
    });

    api.registerService({
      id: 'telegram-notifier-standup',
      async start() {
        standupScheduler.start();
      },
      async stop() {
        standupScheduler.stop();
      },
    });

    // ── Background Message Queue Service ──

    api.registerService({
      id: 'telegram-notifier-queue',
      async start() {
        slog('info', 'queue.started');

        const msPerTick = 3000;
        const maxPerFlush = Math.max(1, Math.floor(config.rateLimit.maxPerMinute / 20));

        flushInterval = setInterval(() => {
          if (MESSAGE_QUEUE.length === 0) return;

          MESSAGE_QUEUE.sort((a, b) => {
            const order = { high: 0, normal: 1, low: 2 };
            return order[a.priority] - order[b.priority];
          });

          const batch = MESSAGE_QUEUE.splice(0, maxPerFlush);

          for (const msg of batch) {
            try {
              const runtime = api.runtime;
              const sendTg = runtime?.channel?.telegram?.sendMessageTelegram;
              if (typeof sendTg === 'function') {
                const sendOpts: Record<string, unknown> = { textMode: 'markdown' };
                if (msg.buttons && msg.buttons.length > 0) {
                  sendOpts['buttons'] = msg.buttons;
                }
                Promise.resolve(sendTg(config.groupId, msg.text, sendOpts)).catch((err: unknown) => {
                  const errStr = String(err);
                  logger.error(`telegram-notifier: Failed to send message: ${errStr}`);
                  // Fallback: log the notification content to stdout so it's visible in docker logs
                  if (errStr.includes('chat not found') || errStr.includes('bot was blocked') || errStr.includes('Forbidden')) {
                    const plain = msg.text
                      .replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1')
                      .replace(/\*/g, '');
                    logger.info(`telegram-notifier [FALLBACK] [${msg.priority}]: ${plain}`);
                  }
                });
              }
            } catch (err) {
              logger.error(`telegram-notifier: Failed to send message: ${String(err)}`);
            }
          }
        }, msPerTick);
      },

      async stop() {
        if (flushInterval) {
          clearInterval(flushInterval);
          flushInterval = null;
        }
        slog('info', 'queue.stopped');
      },
    });

    slog('info', 'plugin.loaded', { groupId: config.groupId });
  },
};
