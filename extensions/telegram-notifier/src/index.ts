import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import {
  escapeMarkdownV2,
  formatTaskTransition,
  formatPrCreation,
  formatQualityGate,
  formatAgentError,
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
    batchMinorEvents: boolean;
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
  const cfg = api.pluginConfig as Record<string, unknown>;
  return {
    groupId: String(cfg?.['groupId'] ?? ''),
    rateLimit: {
      maxPerMinute: Number((cfg?.['rateLimit'] as Record<string, unknown>)?.['maxPerMinute'] ?? 20),
      batchMinorEvents: Boolean((cfg?.['rateLimit'] as Record<string, unknown>)?.['batchMinorEvents'] ?? true),
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

      if (toolName === 'task.transition') {
        enqueue(formatTaskTransition(params), 'normal');
      } else if (toolName === 'vcs.pr.create') {
        enqueue(formatPrCreation(params, result), 'high');
      } else if (toolName === 'quality.gate') {
        enqueue(formatQualityGate(params, result), 'normal');
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
      name: 'status',
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
          return { text: 'Usage: /idea <your product idea>' };
        }
        return { text: `Idea received: "${ideaText}". Routing to PM agent.` };
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
                void sendTg(config.groupId, msg.text, {
                  textMode: 'markdown',
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
