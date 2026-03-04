/**
 * Pure delivery policy evaluator for agent messaging.
 *
 * Determines whether a message should be delivered to an external channel
 * (e.g. Telegram) based on the per-agent delivery policy and message content.
 */

import type { DeliveryConfig, DeliveryMode } from '../config/plugin-config.js';

export interface DeliveryMessageContext {
  /** Message priority: 'low' | 'normal' | 'urgent'. */
  priority: string;
  /** Message subject line. */
  subject: string;
  /** Whether this message is a reply (has a reply_to reference). */
  isReply: boolean;
}

export interface DeliveryDecision {
  /** Whether the message should be delivered to an external channel. */
  deliver: boolean;
  /** The reason for the decision (for logging). */
  reason: string;
}

/**
 * Resolve the effective delivery mode for an agent.
 * Falls back to `config.defaultMode` when no per-agent override exists.
 */
export function getAgentDeliveryMode(config: DeliveryConfig, agentId: string): DeliveryMode {
  return config.agents[agentId]?.mode ?? config.defaultMode;
}

/**
 * Evaluate whether a message from `agentId` should be delivered externally.
 */
export function shouldDeliver(
  config: DeliveryConfig,
  agentId: string,
  message: DeliveryMessageContext,
): DeliveryDecision {
  const mode = getAgentDeliveryMode(config, agentId);

  switch (mode) {
    case 'broadcast':
      return { deliver: true, reason: 'broadcast mode: all messages delivered' };

    case 'internal':
      return { deliver: false, reason: 'internal mode: no external delivery' };

    case 'replies-only':
      return message.isReply
        ? { deliver: true, reason: 'replies-only mode: message is a reply' }
        : { deliver: false, reason: 'replies-only mode: not a reply' };

    case 'smart': {
      // Check priority
      if (config.broadcastPriorities.includes(message.priority)) {
        return { deliver: true, reason: `smart mode: priority "${message.priority}" matches broadcast list` };
      }

      // Check subject keywords (case-insensitive)
      const subjectLower = message.subject.toLowerCase();
      for (const keyword of config.broadcastKeywords) {
        if (subjectLower.includes(keyword.toLowerCase())) {
          return { deliver: true, reason: `smart mode: subject matches keyword "${keyword}"` };
        }
      }

      return { deliver: false, reason: 'smart mode: no priority or keyword match' };
    }

    default:
      return { deliver: false, reason: `unknown mode "${String(mode)}": defaulting to no delivery` };
  }
}
