import type { ToolDef, ToolDeps } from './index.js';
import {
  TeamMessageParams,
  TeamInboxParams,
  TeamReplyParams,
  TeamStatusParams,
  TeamAssignParams,
} from '../schemas/team-messaging.schema.js';
import { MESSAGES_TABLE, ensureMessagesTable } from './shared-db.js';
import { validateMessageBody } from '@openclaw/quality-contracts/validation/message-validator';
import {
  CURRENT_PROTOCOL_VERSION,
  checkVersionCompatibility,
} from '@openclaw/quality-contracts/schemas/protocol-header';

/**
 * Try to parse a message body as a typed protocol message.
 * Returns the parsed object with `_type` if valid JSON with a `_type` field,
 * or `undefined` if the body is plain text or non-JSON.
 */
function tryParseTypedBody(body: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && '_type' in parsed) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON — plain text body, skip validation
  }
  return undefined;
}

export function teamMessageToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'team.message',
    label: 'Send Message',
    description: 'Send a direct message to another agent on the team',
    parameters: TeamMessageParams,
    execute: async (_toolCallId, params) => {
      ensureMessagesTable(deps);
      const input = deps.validate<{
        to: string;
        subject: string;
        body: string;
        priority?: 'low' | 'normal' | 'urgent';
        taskRef?: string;
        from?: string;
        originChannel?: string;
        originSessionKey?: string;
      }>(TeamMessageParams, params);

      // Validate typed message body if _type is present (EP13 Task 0095)
      const typedBody = tryParseTypedBody(input.body);
      if (typedBody) {
        const messageType = String(typedBody['_type']);
        const validation = validateMessageBody(messageType, typedBody);
        if (!validation.valid) {
          const errorDetail = validation.errors?.join('; ') ?? 'unknown validation error';
          const result = {
            delivered: false,
            reason: `Message body validation failed for type "${messageType}": ${errorDetail}`,
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            details: result,
          };
        }
      }

      const id = deps.generateId();
      const now = deps.now();
      const priority = input.priority ?? 'normal';

      // Inject protocol envelope headers into typed messages (EP13 Task 0097)
      // Always overwrite to prevent callers from spoofing sender/version
      let persistBody = input.body;
      if (typedBody) {
        typedBody['_protocol'] = CURRENT_PROTOCOL_VERSION;
        typedBody['_sender'] = input.from ?? 'anonymous';
        typedBody['_timestamp'] = now;
        persistBody = JSON.stringify(typedBody);
      }

      deps.db.prepare(`
        INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, task_ref, origin_channel, origin_session_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.from ?? 'anonymous', input.to, input.subject, persistBody, priority, input.taskRef ?? null, input.originChannel ?? null, input.originSessionKey ?? null, now);

      deps.logger?.info(`team.message: ${id} → ${input.to} [${priority}] "${input.subject}"`);

      const result = { messageId: id, delivered: true, priority, originChannel: input.originChannel ?? null, originSessionKey: input.originSessionKey ?? null };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

export function teamInboxToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'team.inbox',
    label: 'Read Inbox',
    description: 'Retrieve messages for the calling agent',
    parameters: TeamInboxParams,
    execute: async (_toolCallId, params) => {
      ensureMessagesTable(deps);
      const input = deps.validate<{ agentId: string; unreadOnly?: boolean; limit?: number }>(TeamInboxParams, params);
      const limit = input.limit ?? 50;
      const whereClause = input.unreadOnly ? 'AND read = 0' : '';

      const rows = deps.db.prepare(`
        SELECT id, from_agent, to_agent, subject, body, priority, task_ref, reply_to, read, created_at
        FROM ${MESSAGES_TABLE}
        WHERE to_agent = ? ${whereClause}
        ORDER BY created_at DESC
        LIMIT ?
      `).all(input.agentId, limit) as Array<{
        id: string;
        from_agent: string;
        to_agent: string;
        subject: string;
        body: string;
        priority: string;
        task_ref: string | null;
        reply_to: string | null;
        read: number;
        created_at: string;
      }>;

      const messages = rows.map((r) => {
        const msg: Record<string, unknown> = {
          id: r.id,
          from: r.from_agent,
          to: r.to_agent,
          subject: r.subject,
          body: r.body,
          priority: r.priority,
          taskRef: r.task_ref,
          replyTo: r.reply_to,
          read: r.read === 1,
          timestamp: r.created_at,
        };

        // Check protocol version compatibility on typed messages (EP13 Task 0097)
        const parsed = tryParseTypedBody(r.body);
        if (parsed) {
          const senderVersion = typeof parsed['_protocol'] === 'string' ? parsed['_protocol'] : undefined;
          if (senderVersion) {
            const compat = checkVersionCompatibility(senderVersion, CURRENT_PROTOCOL_VERSION);
            if (!compat.compatible) {
              msg['_versionWarning'] = `Protocol version mismatch: sender=${senderVersion}, receiver=${CURRENT_PROTOCOL_VERSION} (${compat.reason})`;
              deps.logger?.warn(`team.inbox: version mismatch on message ${r.id}: sender=${senderVersion}, receiver=${CURRENT_PROTOCOL_VERSION}`);
            }
          } else if (parsed['_type']) {
            // Typed message without protocol version — backward compat warning
            msg['_versionWarning'] = 'Message has _type but no _protocol header (legacy format)';
            deps.logger?.warn(`team.inbox: message ${r.id} has _type but no _protocol header (legacy format)`);
          }
        }

        return msg;
      });

      const result = { messages, count: messages.length };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

export function teamReplyToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'team.reply',
    label: 'Reply to Message',
    description: 'Reply to a received inter-agent message',
    parameters: TeamReplyParams,
    execute: async (_toolCallId, params) => {
      ensureMessagesTable(deps);
      const input = deps.validate<{ messageId: string; body: string }>(TeamReplyParams, params);

      const original = deps.db.prepare(`SELECT id, from_agent, to_agent, subject, task_ref, origin_channel, origin_session_key, reply_to FROM ${MESSAGES_TABLE} WHERE id = ?`).get(input.messageId) as {
        id: string;
        from_agent: string;
        to_agent: string;
        subject: string;
        task_ref: string | null;
        origin_channel: string | null;
        origin_session_key: string | null;
        reply_to: string | null;
      } | undefined;

      if (!original) {
        const result = { replied: false, reason: `Message "${input.messageId}" not found` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      // Walk the reply chain to find the root message's origin if this message doesn't have it fully populated
      let originChannel = original.origin_channel;
      let originSessionKey = original.origin_session_key;
      if ((!originChannel || !originSessionKey) && original.reply_to) {
        let currentId: string | null = original.reply_to;
        const visited = new Set<string>([original.id]);
        while (currentId && (!originChannel || !originSessionKey)) {
          if (visited.has(currentId)) break; // cycle guard
          visited.add(currentId);
          const ancestor = deps.db.prepare(
            `SELECT origin_channel, origin_session_key, reply_to FROM ${MESSAGES_TABLE} WHERE id = ?`,
          ).get(currentId) as { origin_channel: string | null; origin_session_key: string | null; reply_to: string | null } | undefined;
          if (!ancestor) break;
          if (!originChannel && ancestor.origin_channel) {
            originChannel = ancestor.origin_channel;
          }
          if (!originSessionKey && ancestor.origin_session_key) {
            originSessionKey = ancestor.origin_session_key;
          }
          currentId = ancestor.reply_to;
        }
      }

      const replyId = deps.generateId();
      const now = deps.now();

      deps.db.prepare(`
        INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, task_ref, reply_to, origin_channel, origin_session_key, created_at)
        VALUES (?, ?, ?, ?, ?, 'normal', ?, ?, ?, ?, ?)
      `).run(replyId, original.to_agent, original.from_agent, `Re: ${original.subject}`, input.body, original.task_ref, input.messageId, originChannel, originSessionKey, now);

      // Mark original as read
      deps.db.prepare(`UPDATE ${MESSAGES_TABLE} SET read = 1 WHERE id = ?`).run(input.messageId);

      const result = { replied: true, replyId, from: original.to_agent, to: original.from_agent, originChannel, originSessionKey };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

export function teamStatusToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'team.status',
    label: 'Team Status',
    description: 'Get the status of all agents in the team',
    parameters: TeamStatusParams,
    execute: async (_toolCallId, _params) => {
      const agentConfig = deps.agentConfig ?? [];
      const agents = agentConfig.map((a: { id: string; name: string; model?: { primary?: string } }) => ({
        id: a.id,
        name: a.name,
        model: a.model?.primary ?? 'unknown',
        status: 'idle',
      }));

      const result = { agents };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}

export function teamAssignToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'team.assign',
    label: 'Assign Task',
    description: 'Assign a task to a specific agent (used by Tech Lead)',
    parameters: TeamAssignParams,
    execute: async (_toolCallId, params) => {
      const input = deps.validate<{ taskId: string; agentId: string; message?: string; fromAgent?: string }>(TeamAssignParams, params);

      const task = deps.taskRepo.getById(input.taskId);
      if (!task) {
        const result = { assigned: false, reason: `Task "${input.taskId}" not found` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      deps.taskRepo.update(input.taskId, { assignee: input.agentId }, task.rev, deps.now());

      deps.logger?.info(`team.assign: Task ${input.taskId} → agent ${input.agentId}`);

      if (input.message) {
        ensureMessagesTable(deps);
        const msgId = deps.generateId();
        deps.db.prepare(`
          INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, task_ref, created_at)
          VALUES (?, ?, ?, ?, ?, 'normal', ?, ?)
        `).run(msgId, input.fromAgent ?? 'tech-lead', input.agentId, `Task Assignment: ${task.title}`, input.message, input.taskId, deps.now());
      }

      const result = { assigned: true, taskId: input.taskId, agentId: input.agentId };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };
}
