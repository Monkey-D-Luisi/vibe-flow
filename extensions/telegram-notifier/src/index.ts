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

    api.registerCommand({
      name: 'budget',
      description: 'Cost tracking summary',
      handler: async () => {
        return { text: 'Budget tracking coming in Task 0046 (production profile).' };
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
          const db = (api as unknown as Record<string, unknown>)['_sharedDb'];
          if (!db || typeof db !== 'object') {
            return { text: '⚠️ Decision database not available from this context\\.' };
          }

          const dbAny = db as { prepare: (sql: string) => { get: (...args: unknown[]) => unknown; run: (...args: unknown[]) => unknown } };

          const row = dbAny.prepare(
            'SELECT id, escalated, approver, decision FROM agent_decisions WHERE id = ?',
          ).get(decisionId) as { id: string; escalated: number; approver: string | null; decision: string | null } | undefined;

          if (!row) {
            return { text: `❌ Decision \`${escapeMarkdownV2(decisionId)}\` not found\\.` };
          }

          if (row.decision !== null) {
            return { text: `ℹ️ Decision \`${escapeMarkdownV2(decisionId)}\` already resolved: \`${escapeMarkdownV2(row.decision)}\`\\.` };
          }

          dbAny.prepare(
            'UPDATE agent_decisions SET decision = ?, reasoning = COALESCE(reasoning, \'\') || ? WHERE id = ?',
          ).run(choice, ` [Approved via Telegram by human]`, decisionId);

          return { text: `✅ Decision \`${escapeMarkdownV2(decisionId)}\` approved with choice \`${escapeMarkdownV2(choice)}\`\\.` };
        } catch (err: unknown) {
          logger.warn(`telegram-notifier: /approve failed: ${String(err)}`);
          return { text: `⚠️ Failed to process approval: ${escapeMarkdownV2(String(err))}` };
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
          const db = (api as unknown as Record<string, unknown>)['_sharedDb'];
          if (!db || typeof db !== 'object') {
            return { text: '⚠️ Decision database not available from this context\\.' };
          }

          const dbAny = db as { prepare: (sql: string) => { get: (...args: unknown[]) => unknown; run: (...args: unknown[]) => unknown } };

          const row = dbAny.prepare(
            'SELECT id, decision FROM agent_decisions WHERE id = ?',
          ).get(decisionId) as { id: string; decision: string | null } | undefined;

          if (!row) {
            return { text: `❌ Decision \`${escapeMarkdownV2(decisionId)}\` not found\\.` };
          }

          if (row.decision !== null) {
            return { text: `ℹ️ Decision \`${escapeMarkdownV2(decisionId)}\` already resolved\\.` };
          }

          dbAny.prepare(
            'UPDATE agent_decisions SET approver = \'tech-lead\', reasoning = COALESCE(reasoning, \'\') || ? WHERE id = ?',
          ).run(` [Rejected via Telegram: ${reason}]`, decisionId);

          return { text: `🔄 Decision \`${escapeMarkdownV2(decisionId)}\` rejected and re\\-escalated to tech\\-lead\\.` };
        } catch (err: unknown) {
          logger.warn(`telegram-notifier: /reject failed: ${String(err)}`);
          return { text: `⚠️ Failed to process rejection: ${escapeMarkdownV2(String(err))}` };
        }
      },
    });

    api.registerCommand({
      name: 'decisions',
      description: 'List pending decisions awaiting human approval',
      handler: async () => {
        try {
          const db = (api as unknown as Record<string, unknown>)['_sharedDb'];
          if (!db || typeof db !== 'object') {
            return { text: '⚠️ Decision database not available from this context\\.' };
          }

          const dbAny = db as { prepare: (sql: string) => { all: () => unknown[] } };

          const rows = dbAny.prepare(
            'SELECT id, category, question, approver, created_at FROM agent_decisions WHERE decision IS NULL AND escalated = 1 ORDER BY created_at DESC LIMIT 10',
          ).all() as Array<{ id: string; category: string; question: string; approver: string | null; created_at: string }>;

          if (rows.length === 0) {
            return { text: '✅ No pending decisions\\.' };
          }

          const lines = rows.map((r) =>
            `• \`${escapeMarkdownV2(r.id)}\` \\[${escapeMarkdownV2(r.category)}\\] ${escapeMarkdownV2(r.question.slice(0, 60))} → ${escapeMarkdownV2(r.approver ?? 'unknown')}`,
          );

          return { text: `📋 *Pending decisions \\(${rows.length}\\):*\n\n${lines.join('\n')}` };
        } catch (err: unknown) {
          logger.warn(`telegram-notifier: /decisions failed: ${String(err)}`);
          return { text: `⚠️ Could not list decisions: ${escapeMarkdownV2(String(err))}` };
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
                  logger.error(`telegram-notifier: Failed to send message: ${String(err)}`);
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
