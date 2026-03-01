import type { ToolDef, ToolDeps } from './index.js';
import {
  TeamMessageParams,
  TeamInboxParams,
  TeamReplyParams,
  TeamStatusParams,
  TeamAssignParams,
} from '../schemas/team-messaging.schema.js';

const MESSAGES_TABLE = 'agent_messages';

function ensureMessagesTable(deps: ToolDeps): void {
  deps.db.exec(`
    CREATE TABLE IF NOT EXISTS ${MESSAGES_TABLE} (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      task_ref TEXT,
      reply_to TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reply_to) REFERENCES ${MESSAGES_TABLE}(id)
    )
  `);
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
      }>(TeamMessageParams, params);

      const id = deps.generateId();
      const now = deps.now();
      const priority = input.priority ?? 'normal';

      deps.db.prepare(`
        INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, task_ref, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.from ?? 'anonymous', input.to, input.subject, input.body, priority, input.taskRef ?? null, now);

      deps.logger?.info(`team.message: ${id} → ${input.to} [${priority}] "${input.subject}"`);

      const result = { messageId: id, delivered: true, priority };
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

      const messages = rows.map((r) => ({
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
      }));

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

      const original = deps.db.prepare(`SELECT id, from_agent, to_agent, subject, task_ref FROM ${MESSAGES_TABLE} WHERE id = ?`).get(input.messageId) as {
        from_agent: string;
        to_agent: string;
        subject: string;
        task_ref: string | null;
      } | undefined;

      if (!original) {
        const result = { replied: false, reason: `Message "${input.messageId}" not found` };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      }

      const replyId = deps.generateId();
      const now = deps.now();

      deps.db.prepare(`
        INSERT INTO ${MESSAGES_TABLE} (id, from_agent, to_agent, subject, body, priority, task_ref, reply_to, created_at)
        VALUES (?, ?, ?, ?, ?, 'normal', ?, ?, ?)
      `).run(replyId, original.to_agent, original.from_agent, `Re: ${original.subject}`, input.body, original.task_ref, input.messageId, now);

      // Mark original as read
      deps.db.prepare(`UPDATE ${MESSAGES_TABLE} SET read = 1 WHERE id = ?`).run(input.messageId);

      const result = { replied: true, replyId };
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
