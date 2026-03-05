import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractDetails,
  handleTeamMessageAutoSpawn,
  handleTeamReplyAutoSpawn,
  handleDecisionEscalationAutoSpawn,
  registerAutoSpawnHooks,
  resetDedupCache,
  rebuildSessionKeyForAgent,
  extractChatIdFromSessionKey,
  type AutoSpawnDeps,
} from '../../src/hooks/auto-spawn.js';
import type { OpenClawPluginApi } from '../../src/index.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createDeps(overrides?: Partial<AutoSpawnDeps>): AutoSpawnDeps {
  return {
    agents: [
      { id: 'tech-lead', name: 'Tech Lead' },
      { id: 'pm', name: 'Product Manager' },
      { id: 'back-1', name: 'Senior Backend Developer' },
    ],
    logger: { info: vi.fn(), warn: vi.fn() },
    agentRunner: { spawnAgent: vi.fn() },
    ...overrides,
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    toolName: 'team_message',
    error: undefined as unknown,
    result: undefined as unknown,
    params: undefined as Record<string, unknown> | undefined,
    ...overrides,
  };
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    agentId: 'pm',
    sessionKey: 'agent:pm:session:abc123',
    ...overrides,
  };
}

// ── rebuildSessionKeyForAgent ────────────────────────────────────────────────

describe('rebuildSessionKeyForAgent', () => {
  it('replaces the agent ID in a standard session key', () => {
    expect(rebuildSessionKeyForAgent('agent:pm:telegram:group:-12345', 'tech-lead'))
      .toBe('agent:tech-lead:telegram:group:-12345');
  });

  it('replaces the agent ID in a DM session key', () => {
    expect(rebuildSessionKeyForAgent('agent:pm:telegram:dm:67890', 'qa'))
      .toBe('agent:qa:telegram:dm:67890');
  });

  it('replaces the agent ID in a main session key', () => {
    expect(rebuildSessionKeyForAgent('agent:pm:main', 'back-1'))
      .toBe('agent:back-1:main');
  });

  it('falls back to agent:<id>:main for unrecognised formats', () => {
    expect(rebuildSessionKeyForAgent('random-key', 'tech-lead'))
      .toBe('agent:tech-lead:main');
  });
});

describe('extractChatIdFromSessionKey', () => {
  it('extracts chatId from a group session key', () => {
    expect(extractChatIdFromSessionKey('agent:pm:telegram:group:-1005177552677'))
      .toBe('-1005177552677');
  });

  it('extracts userId from a DM session key', () => {
    expect(extractChatIdFromSessionKey('agent:pm:telegram:dm:67890'))
      .toBe('67890');
  });

  it('returns null for a deprecated telegram-tl channel session key', () => {
    expect(extractChatIdFromSessionKey('agent:tech-lead:telegram-tl:group:-1005177552677'))
      .toBeNull();
  });

  it('returns null for a deprecated telegram-designer DM session key', () => {
    expect(extractChatIdFromSessionKey('agent:designer:telegram-designer:dm:67890'))
      .toBeNull();
  });

  it('returns null for a main session key', () => {
    expect(extractChatIdFromSessionKey('agent:pm:main'))
      .toBeNull();
  });

  it('returns null for unrecognised formats', () => {
    expect(extractChatIdFromSessionKey('random-key'))
      .toBeNull();
  });
});

// ── extractDetails ──────────────────────────────────────────────────────────

describe('extractDetails', () => {
  it('returns null for null/undefined', () => {
    expect(extractDetails(null)).toBeNull();
    expect(extractDetails(undefined)).toBeNull();
  });

  it('returns null for non-object result', () => {
    expect(extractDetails('string')).toBeNull();
    expect(extractDetails(42)).toBeNull();
    expect(extractDetails(true)).toBeNull();
  });

  it('extracts details property when present', () => {
    const details = { delivered: true, messageId: 'msg-1' };
    const result = { content: [], details };
    expect(extractDetails(result)).toEqual(details);
  });

  it('returns result itself when no details property', () => {
    const result = { delivered: true, messageId: 'msg-1' };
    expect(extractDetails(result)).toEqual(result);
  });

  it('returns null when details is a non-object', () => {
    const result = { details: 'string-value' };
    // Falls through to return the outer object
    expect(extractDetails(result)).toEqual(result);
  });
});

// ── handleTeamMessageAutoSpawn ──────────────────────────────────────────────

describe('handleTeamMessageAutoSpawn', () => {
  let deps: AutoSpawnDeps;

  beforeEach(() => {
    deps = createDeps();
    resetDedupCache();
  });

  it('does nothing for non-team_message events', () => {
    const event = makeEvent({ toolName: 'task_create' });
    handleTeamMessageAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when event has an error', () => {
    const event = makeEvent({ error: new Error('fail') });
    handleTeamMessageAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when result has no details', () => {
    const event = makeEvent({ result: null });
    handleTeamMessageAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when message was not delivered', () => {
    const event = makeEvent({
      result: { details: { delivered: false, messageId: 'msg-1' } },
      params: { to: 'tech-lead', subject: 'Hello' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when target agent is empty', () => {
    const event = makeEvent({
      result: { details: { delivered: true, messageId: 'msg-1' } },
      params: { to: '', subject: 'Hello' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('spawns agent even when sessionKey is missing (SDK never provides it)', () => {
    const event = makeEvent({
      result: { details: { delivered: true, messageId: 'msg-1' } },
      params: { to: 'tech-lead', subject: 'Hello' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx({ sessionKey: undefined }));
    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
  });

  it('does nothing when target agent is not in the team config', () => {
    const event = makeEvent({
      result: { details: { delivered: true, messageId: 'msg-1' } },
      params: { to: 'unknown-agent', subject: 'Hello' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not found in config'),
    );
  });

  it('fires agent spawn for a valid team_message', () => {
    const event = makeEvent({
      result: { details: { delivered: true, messageId: 'msg-42' } },
      params: { to: 'tech-lead', subject: 'Architecture review' },
    });
    const ctx = makeCtx();
    handleTeamMessageAutoSpawn(deps, event, ctx);

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const [agentId, message] = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(agentId).toBe('tech-lead');
    expect(message).toContain('msg-42');
    expect(message).toContain('Architecture review');
    expect(message).toContain('team_inbox');
  });

  it('logs info with message ID and agent names', () => {
    const event = makeEvent({
      result: { details: { delivered: true, messageId: 'msg-77' } },
      params: { to: 'back-1', subject: 'Task assignment' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx());

    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('msg-77'),
    );
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('back-1'),
    );
  });

  it('catches and logs spawnAgent failures', () => {
    (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('spawn failed');
    });

    const event = makeEvent({
      result: { details: { delivered: true, messageId: 'msg-1' } },
      params: { to: 'tech-lead', subject: 'Hello' },
    });
    // Should not throw
    handleTeamMessageAutoSpawn(deps, event, makeCtx());

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('spawnAgent failed'),
    );
  });

  it('handles result without details wrapper (flat result)', () => {
    const event = makeEvent({
      result: { delivered: true, messageId: 'msg-flat' },
      params: { to: 'tech-lead', subject: 'Flat result' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
  });

  it('delivers to origin channel when sender is broadcast and originChannel exists', () => {
    deps = createDeps({
      deliveryConfig: {
        defaultMode: 'smart',
        broadcastKeywords: [],
        broadcastPriorities: ['urgent'],
        agents: { pm: { mode: 'broadcast' } },
        agentAccounts: {},
      },
    });
    resetDedupCache();

    const event = makeEvent({
      result: {
        details: {
          delivered: true,
          messageId: 'msg-bc',
          originChannel: 'telegram',
          originSessionKey: 'agent:pm:telegram:group:-517123',
        },
      },
      params: { to: 'tech-lead', subject: 'Review this' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx({ agentId: 'pm' }));

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const options = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(options).toEqual({
      deliver: true,
      channel: 'telegram',
      idempotencyKey: 'tm:msg-bc:tech-lead',
      sessionKey: 'agent:tech-lead:telegram:group:-517123',
      to: '-517123',
    });
  });

  it('routes to target agent account when agentAccounts is configured', () => {
    deps = createDeps({
      deliveryConfig: {
        defaultMode: 'smart',
        broadcastKeywords: [],
        broadcastPriorities: ['urgent'],
        agents: { pm: { mode: 'broadcast' } },
        agentAccounts: { 'tech-lead': 'tl', 'designer': 'designer' },
      },
    });
    resetDedupCache();

    const event = makeEvent({
      result: {
        details: {
          delivered: true,
          messageId: 'msg-ac',
          originChannel: 'telegram',
          originSessionKey: 'agent:pm:telegram:group:-517123',
        },
      },
      params: { to: 'tech-lead', subject: 'Architecture review' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx({ agentId: 'pm' }));

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const options = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(options).toEqual({
      deliver: true,
      channel: 'telegram',
      accountId: 'tl',
      idempotencyKey: 'tm:msg-ac:tech-lead',
      sessionKey: 'agent:tech-lead:telegram:group:-517123',
      to: '-517123',
    });
  });

  it('does not deliver when sender is internal', () => {
    deps = createDeps({
      agents: [
        { id: 'tech-lead', name: 'Tech Lead' },
        { id: 'pm', name: 'Product Manager' },
        { id: 'back-1', name: 'Senior Backend Developer' },
        { id: 'front-1', name: 'Senior Frontend Developer' },
      ],
      deliveryConfig: {
        defaultMode: 'smart',
        broadcastKeywords: [],
        broadcastPriorities: [],
        agents: { 'back-1': { mode: 'internal' } },
        agentAccounts: {},
      },
    });
    resetDedupCache();

    const event = makeEvent({
      result: {
        details: {
          delivered: true,
          messageId: 'msg-int',
          originChannel: 'telegram',
        },
      },
      params: { to: 'front-1', subject: 'Internal chat' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx({ agentId: 'back-1' }));

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const options = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(options).toBeUndefined();
  });
});

// ── handleDecisionEscalationAutoSpawn ───────────────────────────────────────

describe('handleDecisionEscalationAutoSpawn', () => {
  let deps: AutoSpawnDeps;

  beforeEach(() => {
    deps = createDeps();
    resetDedupCache();
  });

  it('does nothing for non-decision_evaluate events', () => {
    const event = makeEvent({ toolName: 'task_update' });
    handleDecisionEscalationAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when event has an error', () => {
    const event = makeEvent({ toolName: 'decision_evaluate', error: new Error('fail') });
    handleDecisionEscalationAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when decision was not escalated', () => {
    const event = makeEvent({
      toolName: 'decision_evaluate',
      result: { details: { escalated: false, decisionId: 'd-1' } },
    });
    handleDecisionEscalationAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when approver is human', () => {
    const event = makeEvent({
      toolName: 'decision_evaluate',
      result: {
        details: {
          escalated: true,
          approver: 'human',
          decisionId: 'd-2',
          nextAction: { agentId: 'tech-lead', task: 'Review' },
        },
      },
    });
    handleDecisionEscalationAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
    // But it should still log the escalation info
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('d-2'),
    );
  });

  it('does nothing when no nextAction present', () => {
    const event = makeEvent({
      toolName: 'decision_evaluate',
      result: {
        details: {
          escalated: true,
          approver: 'tech-lead',
          decisionId: 'd-3',
        },
      },
    });
    handleDecisionEscalationAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('spawns agent even when sessionKey is missing (SDK never provides it)', () => {
    const event = makeEvent({
      toolName: 'decision_evaluate',
      result: {
        details: {
          escalated: true,
          approver: 'tech-lead',
          decisionId: 'd-4',
          nextAction: { agentId: 'tech-lead', task: 'Review' },
        },
      },
    });
    handleDecisionEscalationAutoSpawn(deps, event, makeCtx({ sessionKey: undefined }));
    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
  });

  it('fires agent spawn for a valid escalation', () => {
    const event = makeEvent({
      toolName: 'decision_evaluate',
      result: {
        details: {
          escalated: true,
          approver: 'tech-lead',
          decisionId: 'd-5',
          nextAction: { agentId: 'tech-lead', task: 'Approve scope change' },
        },
      },
    });
    const ctx = makeCtx();
    handleDecisionEscalationAutoSpawn(deps, event, ctx);

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const [agentId, task] = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(agentId).toBe('tech-lead');
    expect(task).toContain('Approve scope change');
  });

  it('uses approver as agentId fallback when nextAction.agentId is missing', () => {
    const event = makeEvent({
      toolName: 'decision_evaluate',
      result: {
        details: {
          escalated: true,
          approver: 'pm',
          decisionId: 'd-6',
          nextAction: { task: 'Fallback task' },
        },
      },
    });
    handleDecisionEscalationAutoSpawn(deps, event, makeCtx());

    const [agentId] = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(agentId).toBe('pm');
  });

  it('generates default task when nextAction.task is missing', () => {
    const event = makeEvent({
      toolName: 'decision_evaluate',
      result: {
        details: {
          escalated: true,
          approver: 'tech-lead',
          decisionId: 'd-7',
          nextAction: { agentId: 'tech-lead' },
        },
      },
    });
    handleDecisionEscalationAutoSpawn(deps, event, makeCtx());

    const [, task] = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(task).toContain('Review escalated decision d-7');
  });

  it('catches and logs spawnAgent failures', () => {
    (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('broken');
    });

    const event = makeEvent({
      toolName: 'decision_evaluate',
      result: {
        details: {
          escalated: true,
          approver: 'tech-lead',
          decisionId: 'd-8',
          nextAction: { agentId: 'tech-lead', task: 'Test' },
        },
      },
    });
    handleDecisionEscalationAutoSpawn(deps, event, makeCtx());

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('spawnAgent failed'),
    );
  });
});

// ── handleTeamReplyAutoSpawn ─────────────────────────────────────────────

describe('handleTeamReplyAutoSpawn', () => {
  let deps: AutoSpawnDeps;

  beforeEach(() => {
    deps = createDeps();
    resetDedupCache();
  });

  it('does nothing for non-team_reply events', () => {
    const event = makeEvent({ toolName: 'task_create' });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when event has an error', () => {
    const event = makeEvent({ toolName: 'team_reply', error: new Error('fail') });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when replied is not true', () => {
    const event = makeEvent({
      toolName: 'team_reply',
      result: { details: { replied: false } },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when target agent is empty', () => {
    const event = makeEvent({
      toolName: 'team_reply',
      result: { details: { replied: true, to: '', from: 'tech-lead', replyId: 'r-1' } },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when target agent is not in team config', () => {
    const event = makeEvent({
      toolName: 'team_reply',
      result: { details: { replied: true, to: 'unknown-agent', from: 'tech-lead', replyId: 'r-2' } },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('fires agent spawn without delivery when no deliveryConfig (no legacy fallback)', () => {
    const event = makeEvent({
      toolName: 'team_reply',
      result: { details: { replied: true, to: 'pm', from: 'tech-lead', replyId: 'r-42' } },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const [agentId, message, options] = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(agentId).toBe('pm');
    expect(message).toContain('r-42');
    expect(message).toContain('tech-lead');
    expect(message).toContain('team_inbox');
    // No deliveryConfig → no delivery options
    expect(options).toBeUndefined();
  });

  it('delivers to origin channel when originChannel is present', () => {
    // No deliveryConfig needed — replies always route back to origin
    resetDedupCache();

    const event = makeEvent({
      toolName: 'team_reply',
      result: {
        details: {
          replied: true,
          to: 'pm',
          from: 'tech-lead',
          replyId: 'r-dyn',
          originChannel: 'telegram',
          originSessionKey: 'agent:pm:telegram:group:-517123',
        },
      },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const options = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(options).toEqual({
      deliver: true,
      channel: 'telegram',
      idempotencyKey: 'tr:r-dyn:pm',
      sessionKey: 'agent:pm:telegram:group:-517123',
      to: '-517123',
    });
  });

  it('routes reply to target agent account when agentAccounts is configured', () => {
    deps = createDeps({
      deliveryConfig: {
        defaultMode: 'smart',
        broadcastKeywords: [],
        broadcastPriorities: ['urgent'],
        agents: {},
        agentAccounts: { pm: '', 'tech-lead': 'tl' },
      },
    });
    resetDedupCache();

    const event = makeEvent({
      toolName: 'team_reply',
      result: {
        details: {
          replied: true,
          to: 'tech-lead',
          from: 'pm',
          replyId: 'r-channel',
          originChannel: 'telegram',
          originSessionKey: 'agent:pm:telegram:group:-517123',
        },
      },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const options = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(options).toEqual({
      deliver: true,
      channel: 'telegram',
      accountId: 'tl',
      idempotencyKey: 'tr:r-channel:tech-lead',
      sessionKey: 'agent:tech-lead:telegram:group:-517123',
      to: '-517123',
    });
  });

  it('delivers reply to origin even when sender delivery mode is internal', () => {
    // Reply routing ignores the sender's delivery mode — it always honours
    // the conversation's origin channel.
    deps = createDeps({
      deliveryConfig: {
        defaultMode: 'smart',
        broadcastKeywords: [],
        broadcastPriorities: ['urgent'],
        agents: { 'tech-lead': { mode: 'internal' } },
        agentAccounts: {},
      },
    });
    resetDedupCache();

    const event = makeEvent({
      toolName: 'team_reply',
      result: {
        details: {
          replied: true,
          to: 'pm',
          from: 'tech-lead',
          replyId: 'r-int',
          originChannel: 'telegram',
        },
      },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const options = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(options).toEqual({
      deliver: true,
      channel: 'telegram',
      idempotencyKey: 'tr:r-int:pm',
    });
  });

  it('skips delivery when originChannel is missing even with deliveryConfig', () => {
    deps = createDeps({
      deliveryConfig: {
        defaultMode: 'broadcast',
        broadcastKeywords: [],
        broadcastPriorities: [],
        agents: {},
        agentAccounts: {},
      },
    });
    resetDedupCache();

    const event = makeEvent({
      toolName: 'team_reply',
      result: {
        details: {
          replied: true,
          to: 'pm',
          from: 'tech-lead',
          replyId: 'r-noorigin',
          // no originChannel
        },
      },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const options = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(options).toBeUndefined();
  });

  it('deduplicates identical reply spawns', () => {
    const event = makeEvent({
      toolName: 'team_reply',
      result: { details: { replied: true, to: 'pm', from: 'tech-lead', replyId: 'r-dup' } },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());
    handleTeamReplyAutoSpawn(deps, event, makeCtx());

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
  });

  it('catches and logs spawnAgent failures', () => {
    (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('spawn failed');
    });

    const event = makeEvent({
      toolName: 'team_reply',
      result: { details: { replied: true, to: 'pm', from: 'tech-lead', replyId: 'r-err' } },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('spawnAgent failed'),
    );
  });
});

// ── registerAutoSpawnHooks ──────────────────────────────────────────────────

describe('registerAutoSpawnHooks', () => {
  it('registers three after_tool_call hooks (team_message, team_reply, decision_evaluate)', () => {
    const mockRunner = { spawnAgent: vi.fn() };
    const api = {
      logger: { info: vi.fn(), warn: vi.fn() },
      on: vi.fn(),
    } as unknown as OpenClawPluginApi;

    const agents = [{ id: 'pm', name: 'PM' }];
    registerAutoSpawnHooks(api, agents, mockRunner);

    expect(api.on).toHaveBeenCalledTimes(3);
    expect((api.on as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('after_tool_call');
    expect((api.on as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe('after_tool_call');
    expect((api.on as ReturnType<typeof vi.fn>).mock.calls[2][0]).toBe('after_tool_call');
  });

  it('wraps handlers with try-catch so errors do not propagate', () => {
    const mockRunner = {
      spawnAgent: () => {
        throw new Error('boom');
      },
    };
    const api = {
      logger: { info: vi.fn(), warn: vi.fn() },
      on: vi.fn(),
    } as unknown as OpenClawPluginApi;

    const agents = [{ id: 'tech-lead', name: 'TL' }];
    registerAutoSpawnHooks(api, agents, mockRunner);

    // Extract and invoke the team_message handler
    const handler = (api.on as ReturnType<typeof vi.fn>).mock.calls[0][1] as (
      event: unknown,
      ctx: unknown,
    ) => void;

    // Should not throw
    expect(() =>
      handler(
        {
          toolName: 'team_message',
          result: { details: { delivered: true, messageId: 'x' } },
          params: { to: 'tech-lead', subject: 'Hi' },
        },
        { agentId: 'pm', sessionKey: 'test-session' },
      ),
    ).not.toThrow();
  });
});
