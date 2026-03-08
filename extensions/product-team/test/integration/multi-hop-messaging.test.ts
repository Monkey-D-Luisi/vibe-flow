/**
 * Integration tests for multi-hop agent messaging.
 *
 * These tests exercise the full flow: tool execution (team_message / team_inbox /
 * team_reply) combined with the auto-spawn hooks that chain agent interactions.
 *
 * Scenario: PM → TL → Back-1 → TL → PM  (3-hop relay)
 */
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
} from '../../src/tools/team-messaging.js';
import {
  handleTeamMessageAutoSpawn,
  handleTeamReplyAutoSpawn,
  resetDedupCache,
  type AutoSpawnDeps,
} from '../../src/hooks/auto-spawn.js';
import { DEFAULT_TRANSITION_GUARD_CONFIG } from '../../src/orchestrator/transition-guards.js';

// ── Types for tool result access ────────────────────────────────────────────

interface MessageDetails {
  messageId: string;
  delivered: boolean;
  originChannel?: string | null;
  originSessionKey?: string | null;
}

interface ReplyDetails {
  replied: boolean;
  replyId: string;
  from: string;
  to: string;
  originChannel?: string | null;
  originSessionKey?: string | null;
}

interface InboxMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  priority: string;
  reply_to?: string | null;
}

// ── Test helpers ────────────────────────────────────────────────────────────

const AGENTS = [
  { id: 'pm', name: 'Product Manager' },
  { id: 'tech-lead', name: 'Tech Lead' },
  { id: 'back-1', name: 'Senior Backend Developer' },
];

function createAutoSpawnDeps(overrides?: Partial<AutoSpawnDeps>): AutoSpawnDeps {
  return {
    agents: AGENTS,
    logger: { info: vi.fn(), warn: vi.fn() },
    agentRunner: { spawnAgent: vi.fn() },
    ...overrides,
  };
}

function makeAfterToolEvent(
  toolName: string,
  result: unknown,
  params?: Record<string, unknown>,
) {
  return {
    toolName,
    error: undefined as unknown,
    result,
    params,
  };
}

function makeCtx(agentId: string, sessionKey?: string) {
  return { agentId, sessionKey };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('multi-hop agent messaging (integration)', () => {
  let db: Database.Database;
  let toolDeps: ToolDeps;
  let hookDeps: AutoSpawnDeps;
  let idCounter: number;

  beforeEach(() => {
    db = createTestDatabase();
    idCounter = 0;
    resetDedupCache();

    const taskRepo = new SqliteTaskRepository(db);
    const orchestratorRepo = new SqliteOrchestratorRepository(db);
    const eventRepo = new SqliteEventRepository(db);
    const leaseRepo = new SqliteLeaseRepository(db);
    const generateId = () => `01HOP_${String(++idCounter).padStart(10, '0')}`;
    const now = () => '2026-03-08T15:00:00.000Z';
    const eventLog = new EventLog(eventRepo, generateId, now);

    toolDeps = {
      db,
      taskRepo,
      orchestratorRepo,
      leaseRepo,
      eventLog,
      generateId,
      now,
      validate: createValidator(),
      transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
      agentConfig: AGENTS.map(a => ({ ...a, model: { primary: 'test/model' } })),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    hookDeps = createAutoSpawnDeps();
  });

  afterEach(() => {
    db?.close();
  });

  // ── Scenario 1: Simple PM → TL round-trip ──────────────────────────────

  describe('PM → TL round-trip', () => {
    it('PM sends message, hook triggers TL spawn, TL replies, hook triggers PM spawn', async () => {
      const msgTool = teamMessageToolDef(toolDeps);
      const inboxTool = teamInboxToolDef(toolDeps);
      const replyTool = teamReplyToolDef(toolDeps);

      // Step 1: PM sends team_message to tech-lead
      const sendResult = await msgTool.execute('pm-call-1', {
        to: 'tech-lead',
        subject: 'Backend status',
        body: 'How is the backend doing?',
        from: 'pm',
        originChannel: 'telegram',
        originSessionKey: 'agent:pm:telegram:group:-517123',
      });
      const sendDetails = sendResult.details as MessageDetails;
      expect(sendDetails.delivered).toBe(true);
      expect(sendDetails.messageId).toBeTruthy();

      // Step 2: Auto-spawn hook fires for team_message → should spawn tech-lead
      const msgEvent = makeAfterToolEvent('team_message', sendResult, {
        to: 'tech-lead',
        subject: 'Backend status',
      });
      handleTeamMessageAutoSpawn(hookDeps, msgEvent, makeCtx('pm', 'agent:pm:telegram:group:-517123'));

      expect(hookDeps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
      const [spawnedAgent, spawnMsg] = (hookDeps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(spawnedAgent).toBe('tech-lead');
      expect(spawnMsg).toContain(sendDetails.messageId);
      expect(spawnMsg).toContain('team_inbox');

      // Step 3: TL reads inbox
      const tlInbox = await inboxTool.execute('tl-call-1', { agentId: 'tech-lead' });
      const tlMessages = (tlInbox.details as { messages: InboxMessage[] }).messages;
      expect(tlMessages).toHaveLength(1);
      expect(tlMessages[0].from).toBe('pm');
      expect(tlMessages[0].subject).toBe('Backend status');

      // Step 4: TL replies
      const replyResult = await replyTool.execute('tl-call-2', {
        messageId: tlMessages[0].id,
        body: 'Backend is running smoothly, all tests passing.',
      });
      const replyDetails = replyResult.details as ReplyDetails;
      expect(replyDetails.replied).toBe(true);
      expect(replyDetails.from).toBe('tech-lead');
      expect(replyDetails.to).toBe('pm');
      expect(replyDetails.originChannel).toBe('telegram');

      // Step 5: Auto-spawn hook fires for team_reply → should spawn PM
      vi.mocked(hookDeps.agentRunner.spawnAgent).mockClear();
      const replyEvent = makeAfterToolEvent('team_reply', replyResult, {});
      handleTeamReplyAutoSpawn(hookDeps, replyEvent, makeCtx('tech-lead'));

      expect(hookDeps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
      const [replyTarget, replyMsg] = (hookDeps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(replyTarget).toBe('pm');
      expect(replyMsg).toContain(replyDetails.replyId);

      // Step 6: PM reads inbox and sees the reply
      const pmInbox = await inboxTool.execute('pm-call-2', { agentId: 'pm' });
      const pmMessages = (pmInbox.details as { messages: InboxMessage[] }).messages;
      expect(pmMessages).toHaveLength(1);
      expect(pmMessages[0].from).toBe('tech-lead');
      expect(pmMessages[0].body).toBe('Backend is running smoothly, all tests passing.');
      expect(pmMessages[0].subject).toBe('Re: Backend status');
    });
  });

  // ── Scenario 2: 3-hop relay PM → TL → Back-1 → TL → PM ────────────────

  describe('PM → TL → Back-1 → TL → PM (3-hop relay)', () => {
    it('messages chain correctly through 3 agents with origin preserved', async () => {
      const msgTool = teamMessageToolDef(toolDeps);
      const inboxTool = teamInboxToolDef(toolDeps);
      const replyTool = teamReplyToolDef(toolDeps);

      // === Hop 1: PM → TL ===
      const hop1 = await msgTool.execute('pm-1', {
        to: 'tech-lead',
        subject: 'Ask back-1 status',
        body: 'Please ask back-1 how they are doing and relay back.',
        from: 'pm',
        originChannel: 'telegram',
        originSessionKey: 'agent:pm:telegram:group:-517123',
      });
      const hop1Details = hop1.details as MessageDetails;
      expect(hop1Details.delivered).toBe(true);

      // Hook: spawn TL
      const hop1Event = makeAfterToolEvent('team_message', hop1, {
        to: 'tech-lead',
        subject: 'Ask back-1 status',
      });
      handleTeamMessageAutoSpawn(hookDeps, hop1Event, makeCtx('pm'));
      expect(hookDeps.agentRunner.spawnAgent).toHaveBeenCalledWith(
        'tech-lead',
        expect.stringContaining(hop1Details.messageId),
        undefined, // no deliveryConfig → no options
      );

      // TL reads inbox
      const tlInbox1 = await inboxTool.execute('tl-1', { agentId: 'tech-lead' });
      const tlMsgs1 = (tlInbox1.details as { messages: InboxMessage[] }).messages;
      expect(tlMsgs1).toHaveLength(1);
      expect(tlMsgs1[0].body).toContain('ask back-1');

      // === Hop 2: TL → Back-1 ===
      const hop2 = await msgTool.execute('tl-2', {
        to: 'back-1',
        subject: 'Status check',
        body: 'How are you doing? PM needs an update.',
        from: 'tech-lead',
        originChannel: 'telegram',
        originSessionKey: 'agent:pm:telegram:group:-517123',
      });
      const hop2Details = hop2.details as MessageDetails;
      expect(hop2Details.delivered).toBe(true);

      // Hook: spawn Back-1
      vi.mocked(hookDeps.agentRunner.spawnAgent).mockClear();
      const hop2Event = makeAfterToolEvent('team_message', hop2, {
        to: 'back-1',
        subject: 'Status check',
      });
      handleTeamMessageAutoSpawn(hookDeps, hop2Event, makeCtx('tech-lead'));
      expect(hookDeps.agentRunner.spawnAgent).toHaveBeenCalledWith(
        'back-1',
        expect.stringContaining(hop2Details.messageId),
        undefined,
      );

      // Back-1 reads inbox
      const b1Inbox = await inboxTool.execute('b1-1', { agentId: 'back-1' });
      const b1Msgs = (b1Inbox.details as { messages: InboxMessage[] }).messages;
      expect(b1Msgs).toHaveLength(1);
      expect(b1Msgs[0].from).toBe('tech-lead');

      // === Hop 3: Back-1 replies to TL ===
      const hop3 = await replyTool.execute('b1-2', {
        messageId: b1Msgs[0].id,
        body: 'All good, tests green, no blockers.',
      });
      const hop3Details = hop3.details as ReplyDetails;
      expect(hop3Details.replied).toBe(true);
      expect(hop3Details.from).toBe('back-1');
      expect(hop3Details.to).toBe('tech-lead');
      // Origin preserved from the message chain
      expect(hop3Details.originChannel).toBe('telegram');

      // Hook: spawn TL (for the reply)
      // Reply has originChannel=telegram so the hook builds delivery options
      vi.mocked(hookDeps.agentRunner.spawnAgent).mockClear();
      const hop3Event = makeAfterToolEvent('team_reply', hop3, {});
      handleTeamReplyAutoSpawn(hookDeps, hop3Event, makeCtx('back-1'));
      expect(hookDeps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
      const [hop3Agent, hop3Msg] = (hookDeps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(hop3Agent).toBe('tech-lead');
      expect(hop3Msg).toContain(hop3Details.replyId);

      // TL reads inbox (has Back-1's reply plus the original PM message)
      const tlInbox2 = await inboxTool.execute('tl-3', { agentId: 'tech-lead', unreadOnly: true });
      const tlMsgs2 = (tlInbox2.details as { messages: InboxMessage[] }).messages;
      // TL inbox has the unread PM message + Back-1's reply
      const b1Reply = tlMsgs2.find(m => m.from === 'back-1');
      expect(b1Reply).toBeDefined();
      expect(b1Reply!.body).toContain('All good');

      // === Hop 4: TL replies to PM ===
      const hop4 = await replyTool.execute('tl-4', {
        messageId: hop1Details.messageId,
        body: 'Back-1 reports: all good, tests green, no blockers.',
      });
      const hop4Details = hop4.details as ReplyDetails;
      expect(hop4Details.replied).toBe(true);
      expect(hop4Details.from).toBe('tech-lead');
      expect(hop4Details.to).toBe('pm');
      expect(hop4Details.originChannel).toBe('telegram');
      expect(hop4Details.originSessionKey).toBe('agent:pm:telegram:group:-517123');

      // Hook: spawn PM (for the final relay)
      // Reply has originChannel=telegram so delivery options are built
      vi.mocked(hookDeps.agentRunner.spawnAgent).mockClear();
      const hop4Event = makeAfterToolEvent('team_reply', hop4, {});
      handleTeamReplyAutoSpawn(hookDeps, hop4Event, makeCtx('tech-lead'));
      expect(hookDeps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
      const [hop4Agent, hop4Msg] = (hookDeps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(hop4Agent).toBe('pm');
      expect(hop4Msg).toContain(hop4Details.replyId);

      // PM reads inbox (has TL's relay)
      const pmInbox = await inboxTool.execute('pm-3', { agentId: 'pm' });
      const pmMsgs = (pmInbox.details as { messages: InboxMessage[] }).messages;
      expect(pmMsgs).toHaveLength(1);
      expect(pmMsgs[0].from).toBe('tech-lead');
      expect(pmMsgs[0].body).toContain('Back-1 reports');
    });
  });

  // ── Scenario 3: Origin propagation through reply chain ──────────────────

  describe('origin propagation through reply chain', () => {
    it('deep reply chain preserves origin from the root message', async () => {
      const msgTool = teamMessageToolDef(toolDeps);
      const replyTool = teamReplyToolDef(toolDeps);

      // Root message with Telegram origin
      const root = await msgTool.execute('root', {
        to: 'tech-lead',
        subject: 'Deep chain',
        body: 'Start of chain',
        from: 'pm',
        originChannel: 'telegram',
        originSessionKey: 'agent:pm:telegram:group:-517123',
      });
      const rootId = (root.details as MessageDetails).messageId;

      // Reply 1: TL → PM (no explicit origin — inherits from root)
      const r1 = await replyTool.execute('r1', { messageId: rootId, body: 'Reply 1' });
      const r1Id = (r1.details as ReplyDetails).replyId;
      expect((r1.details as ReplyDetails).originChannel).toBe('telegram');

      // Reply 2: PM → TL (chain walk finds root origin)
      const r2 = await replyTool.execute('r2', { messageId: r1Id, body: 'Reply 2' });
      const r2Id = (r2.details as ReplyDetails).replyId;
      expect((r2.details as ReplyDetails).originChannel).toBe('telegram');
      expect((r2.details as ReplyDetails).originSessionKey).toBe('agent:pm:telegram:group:-517123');

      // Reply 3: TL → PM (even deeper)
      const r3 = await replyTool.execute('r3', { messageId: r2Id, body: 'Reply 3' });
      expect((r3.details as ReplyDetails).originChannel).toBe('telegram');
      expect((r3.details as ReplyDetails).originSessionKey).toBe('agent:pm:telegram:group:-517123');
    });
  });

  // ── Scenario 4: Delivery options with deliveryConfig ────────────────────

  describe('delivery routing with deliveryConfig', () => {
    it('auto-spawn passes delivery options when deliveryConfig is present', async () => {
      const msgTool = teamMessageToolDef(toolDeps);

      const deliveryDeps = createAutoSpawnDeps({
        deliveryConfig: {
          defaultMode: 'internal' as const,
          broadcastKeywords: [],
          broadcastPriorities: ['urgent'],
          agents: { pm: { mode: 'broadcast' as const } },
          agentAccounts: { 'tech-lead': 'tl', pm: 'pm' },
        },
      });

      const sendResult = await msgTool.execute('pm-d1', {
        to: 'tech-lead',
        subject: 'Routed msg',
        body: 'Should route via Telegram',
        from: 'pm',
        originChannel: 'telegram',
        originSessionKey: 'agent:pm:telegram:group:-517123',
      });
      const details = sendResult.details as MessageDetails;

      const event = makeAfterToolEvent('team_message', sendResult, {
        to: 'tech-lead',
        subject: 'Routed msg',
      });
      handleTeamMessageAutoSpawn(deliveryDeps, event, makeCtx('pm'));

      expect(deliveryDeps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
      const [agent, , options] = (deliveryDeps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(agent).toBe('tech-lead');
      expect(options).toBeDefined();
      expect(options.deliver).toBe(true);
      expect(options.channel).toBe('telegram');
      expect(options.sessionKey).toBe('agent:tech-lead:telegram:group:-517123');
      expect(options.to).toBe('-517123');
      expect(options.accountId).toBe('tl');
      expect(options.idempotencyKey).toContain(details.messageId);
    });

    it('reply always routes back to origin channel regardless of sender delivery mode', async () => {
      const msgTool = teamMessageToolDef(toolDeps);
      const replyTool = teamReplyToolDef(toolDeps);

      // TL is configured as 'internal' but replies should still route to origin
      const deliveryDeps = createAutoSpawnDeps({
        deliveryConfig: {
          defaultMode: 'internal' as const,
          broadcastKeywords: [],
          broadcastPriorities: ['urgent'],
          agents: { 'tech-lead': { mode: 'internal' as const } },
          agentAccounts: { pm: 'pm', 'tech-lead': 'tl' },
        },
      });

      const sendResult = await msgTool.execute('pm-d2', {
        to: 'tech-lead',
        subject: 'Internal test',
        body: 'Testing reply routing',
        from: 'pm',
        originChannel: 'telegram',
        originSessionKey: 'agent:pm:telegram:group:-517123',
      });
      const msgId = (sendResult.details as MessageDetails).messageId;

      const replyResult = await replyTool.execute('tl-d2', {
        messageId: msgId,
        body: 'My reply',
      });
      const replyDetails = replyResult.details as ReplyDetails;

      const event = makeAfterToolEvent('team_reply', replyResult, {});
      handleTeamReplyAutoSpawn(deliveryDeps, event, makeCtx('tech-lead'));

      expect(deliveryDeps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
      const [, , options] = (deliveryDeps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options).toBeDefined();
      expect(options.deliver).toBe(true);
      expect(options.channel).toBe('telegram');
    });
  });

  // ── Scenario 5: Deduplication across hops ─────────────────────────────

  describe('deduplication across hops', () => {
    it('same message ID does not trigger duplicate spawn', async () => {
      const msgTool = teamMessageToolDef(toolDeps);

      const sendResult = await msgTool.execute('dup-1', {
        to: 'tech-lead',
        subject: 'Dedup test',
        body: 'Should only spawn once',
        from: 'pm',
      });

      const event = makeAfterToolEvent('team_message', sendResult, {
        to: 'tech-lead',
        subject: 'Dedup test',
      });

      // First call triggers spawn
      handleTeamMessageAutoSpawn(hookDeps, event, makeCtx('pm'));
      expect(hookDeps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);

      // Second call with same event is deduplicated
      handleTeamMessageAutoSpawn(hookDeps, event, makeCtx('pm'));
      expect(hookDeps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1); // still 1

      // Different message triggers spawn
      const sendResult2 = await msgTool.execute('dup-2', {
        to: 'tech-lead',
        subject: 'Another msg',
        body: 'Different message',
        from: 'pm',
      });
      const event2 = makeAfterToolEvent('team_message', sendResult2, {
        to: 'tech-lead',
        subject: 'Another msg',
      });
      handleTeamMessageAutoSpawn(hookDeps, event2, makeCtx('pm'));
      expect(hookDeps.agentRunner.spawnAgent).toHaveBeenCalledTimes(2);
    });
  });

  // ── Scenario 6: Unknown agent gracefully skipped ───────────────────────

  describe('unknown agent handling', () => {
    it('message to non-existent agent does not crash and logs warning', async () => {
      const msgTool = teamMessageToolDef(toolDeps);

      const sendResult = await msgTool.execute('ghost-1', {
        to: 'ghost-agent',
        subject: 'Hello ghost',
        body: 'You do not exist',
        from: 'pm',
      });

      const event = makeAfterToolEvent('team_message', sendResult, {
        to: 'ghost-agent',
        subject: 'Hello ghost',
      });
      handleTeamMessageAutoSpawn(hookDeps, event, makeCtx('pm'));

      expect(hookDeps.agentRunner.spawnAgent).not.toHaveBeenCalled();
      expect(hookDeps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('ghost-agent'),
      );
    });
  });
});
