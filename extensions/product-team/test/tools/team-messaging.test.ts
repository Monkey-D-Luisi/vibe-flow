import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers.js';
import { SqliteTaskRepository } from '../../src/persistence/task-repository.js';
import { SqliteOrchestratorRepository } from '../../src/persistence/orchestrator-repository.js';
import { SqliteEventRepository } from '../../src/persistence/event-repository.js';
import { SqliteLeaseRepository } from '../../src/persistence/lease-repository.js';
import { EventLog } from '../../src/orchestrator/event-log.js';
import { createValidator } from '../../src/schemas/validator.js';
import type { ToolDeps } from '../../src/tools/index.js';
import {
  teamMessageToolDef,
  teamInboxToolDef,
  teamReplyToolDef,
  teamStatusToolDef,
  teamAssignToolDef,
} from '../../src/tools/team-messaging.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';
import { taskCreateToolDef } from '../../src/tools/task-create.js';

const NOW = '2026-03-01T12:00:00.000Z';

describe('team messaging tools', () => {
  let db: Database.Database;
  let deps: ToolDeps;
  let idCounter: number;

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;

    const taskRepo = new SqliteTaskRepository(db);
    const orchestratorRepo = new SqliteOrchestratorRepository(db);
    const eventRepo = new SqliteEventRepository(db);
    const leaseRepo = new SqliteLeaseRepository(db);
    const generateId = () => `01MSG_${String(++idCounter).padStart(10, '0')}`;
    const now = () => NOW;
    const eventLog = new EventLog(eventRepo, generateId, now);

    deps = {
      db,
      taskRepo,
      orchestratorRepo,
      leaseRepo,
      eventLog,
      generateId,
      now,
      validate: createValidator(),
      transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
      agentConfig: [
        { id: 'pm', name: 'Product Manager', model: { primary: 'anthropic/claude-sonnet-4-6' } },
        { id: 'tech-lead', name: 'Tech Lead', model: { primary: 'anthropic/claude-opus-4-6' } },
      ],
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
  });

  afterEach(() => {
    db?.close();
  });

  describe('team.message', () => {
    it('creates a message and returns messageId and delivered=true', async () => {
      const tool = teamMessageToolDef(deps);
      const result = await tool.execute('call-1', {
        to: 'tech-lead',
        subject: 'API question',
        body: 'Which version of the API should I target?',
      });

      const details = result.details as { messageId: string; delivered: boolean; priority: string };
      expect(details.delivered).toBe(true);
      expect(details.messageId).toBeTruthy();
      expect(details.priority).toBe('normal');
    });

    it('defaults priority to normal when not specified', async () => {
      const tool = teamMessageToolDef(deps);
      const result = await tool.execute('call-1', {
        to: 'pm',
        subject: 'Question',
        body: 'Quick clarification needed',
      });
      const details = result.details as { priority: string };
      expect(details.priority).toBe('normal');
    });

    it('accepts urgent priority', async () => {
      const tool = teamMessageToolDef(deps);
      const result = await tool.execute('call-1', {
        to: 'tech-lead',
        subject: 'Blocker',
        body: 'Build is failing',
        priority: 'urgent',
      });
      const details = result.details as { priority: string };
      expect(details.priority).toBe('urgent');
    });

    it('persists message in agent_messages table', async () => {
      const tool = teamMessageToolDef(deps);
      await tool.execute('call-1', {
        to: 'tech-lead',
        subject: 'Stored?',
        body: 'This should be stored',
      });

      const row = db.prepare('SELECT * FROM agent_messages').get() as { subject: string; to_agent: string } | undefined;
      expect(row).toBeDefined();
      expect(row?.subject).toBe('Stored?');
      expect(row?.to_agent).toBe('tech-lead');
    });

    it('stores taskRef when provided', async () => {
      const tool = teamMessageToolDef(deps);
      await tool.execute('call-1', {
        to: 'pm',
        subject: 'Task ref',
        body: 'About task 123',
        taskRef: 'task-123',
      });

      const row = db.prepare('SELECT task_ref FROM agent_messages').get() as { task_ref: string } | undefined;
      expect(row?.task_ref).toBe('task-123');
    });

    it('rejects empty subject', async () => {
      const tool = teamMessageToolDef(deps);
      await expect(tool.execute('call-1', { to: 'pm', subject: '', body: 'body' })).rejects.toThrow(/[Vv]alidation/);
    });

    it('returns JSON text content', async () => {
      const tool = teamMessageToolDef(deps);
      const result = await tool.execute('call-1', { to: 'pm', subject: 'Hi', body: 'Hello' });
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('team.inbox', () => {
    it('returns empty inbox when no messages exist', async () => {
      const tool = teamInboxToolDef(deps);
      const result = await tool.execute('call-1', {});
      const details = result.details as { messages: unknown[]; count: number };
      expect(details.messages).toEqual([]);
      expect(details.count).toBe(0);
    });

    it('returns messages after sending some', async () => {
      const msgTool = teamMessageToolDef(deps);
      await msgTool.execute('send-1', { to: 'back-1', subject: 'S1', body: 'B1' });
      await msgTool.execute('send-2', { to: 'back-1', subject: 'S2', body: 'B2' });

      const inboxTool = teamInboxToolDef(deps);
      const result = await inboxTool.execute('call-1', {});
      const details = result.details as { messages: unknown[]; count: number };
      expect(details.count).toBe(2);
    });

    it('filters to unread messages when unreadOnly=true', async () => {
      const msgTool = teamMessageToolDef(deps);
      await msgTool.execute('send-1', { to: 'back-1', subject: 'Unread', body: 'B1' });

      // Mark one as read directly
      db.prepare('UPDATE agent_messages SET read = 1 WHERE subject = ?').run('Unread');

      const inboxTool = teamInboxToolDef(deps);
      const result = await inboxTool.execute('call-1', { unreadOnly: true });
      const details = result.details as { messages: unknown[]; count: number };
      expect(details.count).toBe(0);
    });

    it('respects limit parameter', async () => {
      const msgTool = teamMessageToolDef(deps);
      for (let i = 0; i < 5; i++) {
        await msgTool.execute(`send-${i}`, { to: 'agent', subject: `S${i}`, body: `B${i}` });
      }

      const inboxTool = teamInboxToolDef(deps);
      const result = await inboxTool.execute('call-1', { limit: 3 });
      const details = result.details as { messages: unknown[]; count: number };
      expect(details.count).toBe(3);
    });
  });

  describe('team.reply', () => {
    it('creates a reply message to the original sender', async () => {
      const msgTool = teamMessageToolDef(deps);
      const sent = await msgTool.execute('send-1', { to: 'tech-lead', subject: 'Question', body: 'Original' });
      const { messageId } = sent.details as { messageId: string };

      const replyTool = teamReplyToolDef(deps);
      const result = await replyTool.execute('call-1', { messageId, body: 'Here is my answer' });
      const details = result.details as { replied: boolean; replyId: string };
      expect(details.replied).toBe(true);
      expect(details.replyId).toBeTruthy();
    });

    it('marks the original message as read after reply', async () => {
      const msgTool = teamMessageToolDef(deps);
      const sent = await msgTool.execute('send-1', { to: 'tech-lead', subject: 'Q', body: 'Original' });
      const { messageId } = sent.details as { messageId: string };

      const replyTool = teamReplyToolDef(deps);
      await replyTool.execute('call-1', { messageId, body: 'Reply' });

      const row = db.prepare('SELECT read FROM agent_messages WHERE id = ?').get(messageId) as { read: number } | undefined;
      expect(row?.read).toBe(1);
    });

    it('returns replied=false for non-existent messageId', async () => {
      const replyTool = teamReplyToolDef(deps);
      const result = await replyTool.execute('call-1', { messageId: 'nonexistent-id', body: 'Reply' });
      const details = result.details as { replied: boolean };
      expect(details.replied).toBe(false);
    });

    it('sets reply subject as "Re: <original subject>"', async () => {
      const msgTool = teamMessageToolDef(deps);
      const sent = await msgTool.execute('send-1', { to: 'tech-lead', subject: 'API Design', body: 'Q' });
      const { messageId } = sent.details as { messageId: string };

      const replyTool = teamReplyToolDef(deps);
      const reply = await replyTool.execute('call-1', { messageId, body: 'Answer' });
      const { replyId } = reply.details as { replyId: string };

      const row = db.prepare('SELECT subject FROM agent_messages WHERE id = ?').get(replyId) as { subject: string } | undefined;
      expect(row?.subject).toBe('Re: API Design');
    });
  });

  describe('team.status', () => {
    it('returns all configured agents', async () => {
      const tool = teamStatusToolDef(deps);
      const result = await tool.execute('call-1', {});
      const details = result.details as { agents: Array<{ id: string; name: string; model: string }> };
      expect(details.agents).toHaveLength(2);
      expect(details.agents[0]?.id).toBe('pm');
      expect(details.agents[1]?.id).toBe('tech-lead');
    });

    it('returns empty agents list when agentConfig is undefined', async () => {
      const depsNoAgents = { ...deps, agentConfig: undefined };
      const tool = teamStatusToolDef(depsNoAgents as ToolDeps);
      const result = await tool.execute('call-1', {});
      const details = result.details as { agents: unknown[] };
      expect(details.agents).toEqual([]);
    });

    it('includes model info for each agent', async () => {
      const tool = teamStatusToolDef(deps);
      const result = await tool.execute('call-1', {});
      const details = result.details as { agents: Array<{ model: string }> };
      expect(details.agents[0]?.model).toBe('anthropic/claude-sonnet-4-6');
    });
  });

  describe('team.assign', () => {
    it('assigns a task to an agent and updates assignee', async () => {
      const createTool = taskCreateToolDef(deps);
      const created = await createTool.execute('c1', { title: 'Assign me' });
      const { task } = created.details as { task: { id: string } };

      const assignTool = teamAssignToolDef(deps);
      const result = await assignTool.execute('a1', { taskId: task.id, agentId: 'back-1' });
      const details = result.details as { assigned: boolean; taskId: string; agentId: string };
      expect(details.assigned).toBe(true);
      expect(details.agentId).toBe('back-1');

      const updated = deps.taskRepo.getById(task.id);
      expect(updated?.assignee).toBe('back-1');
    });

    it('sends an assignment message when message param is provided', async () => {
      const createTool = taskCreateToolDef(deps);
      const created = await createTool.execute('c1', { title: 'Task with message' });
      const { task } = created.details as { task: { id: string } };

      const assignTool = teamAssignToolDef(deps);
      await assignTool.execute('a1', {
        taskId: task.id,
        agentId: 'front-1',
        message: 'Please implement the login form',
      });

      const row = db.prepare('SELECT body FROM agent_messages WHERE to_agent = ?').get('front-1') as { body: string } | undefined;
      expect(row?.body).toBe('Please implement the login form');
    });

    it('returns assigned=false when task does not exist', async () => {
      const assignTool = teamAssignToolDef(deps);
      const result = await assignTool.execute('a1', { taskId: 'nonexistent', agentId: 'back-1' });
      const details = result.details as { assigned: boolean };
      expect(details.assigned).toBe(false);
    });
  });
});
