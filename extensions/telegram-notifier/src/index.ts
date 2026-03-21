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

export default {
  id: 'telegram-notifier',
  name: 'Telegram Team Notifier',
  description: 'Bridges agent lifecycle events to Telegram; accepts team commands',

  register(api: OpenClawPluginApi) {
    const config = getConfig(api);
    const logger = api.logger;

    if (!config.groupId) {
      logger.warn('telegram-notifier: No groupId configured, notifications disabled');
      return;
    }

    // EP13 Task 0096: Create API client for product-team HTTP routes (replaces _sharedDb)
    const apiPort = Number(process.env['OPENCLAW_GATEWAY_PORT'] || '28789');
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
        const details = (result && typeof result === 'object')
          ? (result as Record<string, unknown>)['details'] ?? result
          : null;
        if (details && typeof details === 'object') {
          const d = details as Record<string, unknown>;
          if (d['escalated'] === true && d['approver'] && d['approver'] !== 'human') {
            const approver = escapeMarkdownV2(String(d['approver']));
            const decisionId = escapeMarkdownV2(String(d['decisionId'] ?? 'unknown'));
            enqueue(
              `⚡ Decision \`${decisionId}\` escalated to *${approver}*`,
              'high',
            );
          }
        }
      } else if (toolName === 'pipeline_advance') {
        const res = (result && typeof result === 'object')
          ? (result as Record<string, unknown>)
          : {};
        const details = ((res['details'] ?? res) as Record<string, unknown>);
        if (details['advanced'] === true) {
          if (details['currentStage'] === 'DONE') {
            enqueue(formatPipelineComplete(details), 'high');
          } else {
            enqueue(formatPipelineAdvance(details), 'normal');
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
      description: 'Report current agent status',
      acceptsArgs: true,
      handler: async (_ctx) => {
        return { text: '📊 Status command received. Agent dashboard coming in Task 0042.' };
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
      description: 'System health check',
      handler: async () => {
        return { text: 'Gateway is running. Full health endpoint in Task 0046.' };
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
      description: 'List pending decisions awaiting human approval',
      handler: async () => {
        try {
          // EP13 Task 0096: Use API client instead of _sharedDb
          const rows = await ptApi.listPendingDecisions();

          if (rows.length === 0) {
            return { text: '\u2705 No pending decisions\\.' };
          }

          const lines = rows.map((r) =>
            `\u2022 \`${escapeMarkdownV2(r.id)}\` \\[${escapeMarkdownV2(r.category)}\\] ${escapeMarkdownV2(r.question.slice(0, 60))} \u2192 ${escapeMarkdownV2(r.approver ?? 'unknown')}`,
          );

          return { text: `\uD83D\uDCCB *Pending decisions \\(${rows.length}\\):*\n\n${lines.join('\n')}` };
        } catch (err: unknown) {
          logger.warn(`telegram-notifier: /decisions failed: ${String(err)}`);
          return { text: `\u26A0\uFE0F Could not list decisions: ${escapeMarkdownV2(String(err))}` };
        }
      },
    });

    // ── Background Message Queue Service ──

    api.registerService({
      id: 'telegram-notifier-queue',
      async start() {
        logger.info('telegram-notifier: Message queue service started');

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
                Promise.resolve(sendTg(config.groupId, msg.text, {
                  textMode: 'markdown',
                })).catch((err: unknown) => {
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
        logger.info('telegram-notifier: Message queue service stopped');
      },
    });

    logger.info(`telegram-notifier: Registered for group ${config.groupId}`);
  },
};
