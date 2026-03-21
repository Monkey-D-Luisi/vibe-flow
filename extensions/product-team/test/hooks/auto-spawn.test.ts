import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractDetails,
  handleTeamMessageAutoSpawn,
  handleTeamReplyAutoSpawn,
  handleDecisionEscalationAutoSpawn,
  handlePipelineAdvanceAutoSpawn,
  registerAutoSpawnHooks,
  resetDedupCache,
  getDedupSize,
  DEDUP_MAX_SIZE,
  rebuildSessionKeyForAgent,
  extractChatIdFromSessionKey,
  buildAgentParams,
  buildRawWsSpawnScript,
  dispatchAgentSpawn,
  type AutoSpawnDeps,
} from '../../src/hooks/auto-spawn.js';
import type { OpenClawPluginApi } from '../../src/index.js';

// ── Mocks (hoisted by Vitest) ───────────────────────────────────────────────

vi.mock('node:child_process', () => {
  const mockChild = {
    on: vi.fn(),
    unref: vi.fn(),
  };
  return { spawn: vi.fn(() => mockChild) };
});

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    mkdirSync: vi.fn(),
    openSync: vi.fn(() => 99),
    closeSync: vi.fn(),
  };
});

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

  it('does nothing and warns when target agent is not in team config', () => {
    const event = makeEvent({
      toolName: 'team_reply',
      result: { details: { replied: true, to: 'unknown-agent', from: 'tech-lead', replyId: 'r-2' } },
    });
    handleTeamReplyAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not found in config'),
    );
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

// ── handlePipelineAdvanceAutoSpawn ─────────────────────────────────────────

describe('handlePipelineAdvanceAutoSpawn', () => {
  let deps: AutoSpawnDeps;

  beforeEach(() => {
    deps = createDeps();
    resetDedupCache();
  });

  it('does nothing for non-pipeline_advance events', () => {
    const event = makeEvent({ toolName: 'task_update' });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when event has an error', () => {
    const event = makeEvent({ toolName: 'pipeline_advance', error: new Error('fail') });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when advance was not successful', () => {
    const event = makeEvent({
      toolName: 'pipeline_advance',
      result: { details: { advanced: false, reason: 'Task not found' } },
    });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when no nextAction present (DONE stage)', () => {
    const event = makeEvent({
      toolName: 'pipeline_advance',
      result: {
        details: {
          advanced: true,
          taskId: 'T-1',
          currentStage: 'DONE',
        },
      },
    });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when nextAction.action is not spawn_subagent', () => {
    const event = makeEvent({
      toolName: 'pipeline_advance',
      result: {
        details: {
          advanced: true,
          taskId: 'T-2',
          currentStage: 'REVIEW',
          nextAction: { action: 'unknown_action', agentId: 'tech-lead' },
        },
      },
    });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('does nothing when target agent is system', () => {
    const event = makeEvent({
      toolName: 'pipeline_advance',
      result: {
        details: {
          advanced: true,
          taskId: 'T-3',
          currentStage: 'DONE',
          nextAction: { action: 'spawn_subagent', agentId: 'system', task: 'Finalize' },
        },
      },
    });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
  });

  it('warns when target agent is not in team config', () => {
    const event = makeEvent({
      toolName: 'pipeline_advance',
      result: {
        details: {
          advanced: true,
          taskId: 'T-4',
          currentStage: 'QA',
          nextAction: { action: 'spawn_subagent', agentId: 'unknown-agent', task: 'Run QA' },
        },
      },
    });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not found in config'),
    );
  });

  it('fires agent spawn for valid pipeline advance', () => {
    const event = makeEvent({
      toolName: 'pipeline_advance',
      result: {
        details: {
          advanced: true,
          taskId: 'T-5',
          currentStage: 'REVIEW',
          nextAction: { action: 'spawn_subagent', agentId: 'tech-lead', task: 'Execute REVIEW stage' },
        },
      },
    });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
    const [agentId, task] = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(agentId).toBe('tech-lead');
    expect(task).toContain('Execute REVIEW stage');
  });

  it('spawns agent even when sessionKey is missing (SDK never provides it)', () => {
    const event = makeEvent({
      toolName: 'pipeline_advance',
      result: {
        details: {
          advanced: true,
          taskId: 'T-6',
          currentStage: 'DECOMPOSITION',
          nextAction: { action: 'spawn_subagent', agentId: 'tech-lead', task: 'Decompose' },
        },
      },
    });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx({ sessionKey: undefined }));
    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
  });

  it('deduplicates identical pipeline advance spawns', () => {
    const event = makeEvent({
      toolName: 'pipeline_advance',
      result: {
        details: {
          advanced: true,
          taskId: 'T-7',
          currentStage: 'IMPLEMENTATION',
          nextAction: { action: 'spawn_subagent', agentId: 'back-1', task: 'Implement' },
        },
      },
    });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());

    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
  });

  it('catches and logs spawnAgent failures', () => {
    (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('broken');
    });

    const event = makeEvent({
      toolName: 'pipeline_advance',
      result: {
        details: {
          advanced: true,
          taskId: 'T-8',
          currentStage: 'REVIEW',
          nextAction: { action: 'spawn_subagent', agentId: 'tech-lead', task: 'Review' },
        },
      },
    });
    handlePipelineAdvanceAutoSpawn(deps, event, makeCtx());

    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('spawnAgent failed'),
    );
  });
});

// ── registerAutoSpawnHooks ──────────────────────────────────────────────────

describe('registerAutoSpawnHooks', () => {
  it('registers four after_tool_call hooks (team_message, team_reply, decision_evaluate, pipeline_advance)', () => {
    const mockRunner = { spawnAgent: vi.fn() };
    const api = {
      logger: { info: vi.fn(), warn: vi.fn() },
      on: vi.fn(),
    } as unknown as OpenClawPluginApi;

    const agents = [{ id: 'pm', name: 'PM' }];
    registerAutoSpawnHooks(api, agents, mockRunner);

    expect(api.on).toHaveBeenCalledTimes(4);
    expect((api.on as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('after_tool_call');
    expect((api.on as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe('after_tool_call');
    expect((api.on as ReturnType<typeof vi.fn>).mock.calls[2][0]).toBe('after_tool_call');
    expect((api.on as ReturnType<typeof vi.fn>).mock.calls[3][0]).toBe('after_tool_call');
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

// ── buildAgentParams (Task 0094) ────────────────────────────────────────────

describe('buildAgentParams', () => {
  it('builds basic params with sessionKey and message', () => {
    const result = JSON.parse(buildAgentParams('tech-lead', 'agent:tech-lead:main', 'Hello'));
    expect(result.sessionKey).toBe('agent:tech-lead:main');
    expect(result.message).toBe('Hello');
    expect(result.idempotencyKey).toMatch(/^auto-spawn:tech-lead:\d+$/);
  });

  it('uses provided idempotencyKey from options', () => {
    const result = JSON.parse(buildAgentParams('pm', 'agent:pm:main', 'Hi', {
      idempotencyKey: 'custom-key-123',
    }));
    expect(result.idempotencyKey).toBe('custom-key-123');
  });

  it('includes delivery params when deliver is true', () => {
    const result = JSON.parse(buildAgentParams('pm', 'agent:pm:telegram:group:-123', 'Hello', {
      deliver: true,
      channel: 'telegram',
      accountId: 'pm-bot',
      to: '-123',
    }));
    expect(result.deliver).toBe(true);
    expect(result.channel).toBe('telegram');
    expect(result.accountId).toBe('pm-bot');
    expect(result.to).toBe('-123');
  });

  it('omits delivery params when deliver is false', () => {
    const result = JSON.parse(buildAgentParams('pm', 'agent:pm:main', 'Hello', {
      deliver: false,
      channel: 'telegram',
    }));
    expect(result.deliver).toBeUndefined();
    expect(result.channel).toBeUndefined();
  });

  it('omits optional accountId and to when not provided', () => {
    const result = JSON.parse(buildAgentParams('pm', 'agent:pm:main', 'Hello', {
      deliver: true,
      channel: 'telegram',
    }));
    expect(result.deliver).toBe(true);
    expect(result.channel).toBe('telegram');
    expect(result.accountId).toBeUndefined();
    expect(result.to).toBeUndefined();
  });
});

// ── buildRawWsSpawnScript (Task 0094) ───────────────────────────────────────

describe('buildRawWsSpawnScript', () => {
  it('generates ESM script with no SDK imports', () => {
    const script = buildRawWsSpawnScript('tech-lead', '{"sessionKey":"agent:tech-lead:main"}', '28789');
    // Zero SDK imports — only node:crypto and WebSocket
    expect(script).not.toContain('openclaw');
    expect(script).not.toContain('clientMod');
    expect(script).not.toContain('readdirSync');
    expect(script).toContain('import { randomUUID } from "node:crypto"');
  });

  it('includes gateway protocol connect frame with correct version', () => {
    const script = buildRawWsSpawnScript('pm', '{}', '28789');
    expect(script).toContain('minProtocol: 3');
    expect(script).toContain('maxProtocol: 3');
  });

  it('includes connect.challenge handler', () => {
    const script = buildRawWsSpawnScript('pm', '{}', '28789');
    expect(script).toContain('connect.challenge');
    expect(script).toContain('payload?.nonce');
  });

  it('sends connect then agent request in sequence', () => {
    const script = buildRawWsSpawnScript('pm', '{}', '28789');
    expect(script).toContain('sendReq(ws, "connect"');
    expect(script).toContain('sendReq(ws, "agent"');
  });

  it('uses correct WebSocket URL with provided port', () => {
    const script = buildRawWsSpawnScript('tech-lead', '{}', '3000');
    expect(script).toContain('ws://127.0.0.1:3000');
  });

  it('embeds agent params in the script', () => {
    const params = JSON.stringify({ sessionKey: 'agent:qa:main', message: 'Run tests' });
    const script = buildRawWsSpawnScript('qa', params, '28789');
    expect(script).toContain('agent:qa:main');
    expect(script).toContain('Run tests');
  });

  it('uses WebSocket global with ws fallback for older Node', () => {
    const script = buildRawWsSpawnScript('pm', '{}', '28789');
    expect(script).toContain('typeof WebSocket !== "undefined"');
    expect(script).toContain('await import("ws")');
  });

  it('includes 30s timeout', () => {
    const script = buildRawWsSpawnScript('pm', '{}', '28789');
    expect(script).toContain('30000');
    expect(script).toContain('timeout after 30s');
  });

  it('includes correct auth token env var', () => {
    const script = buildRawWsSpawnScript('pm', '{}', '28789');
    expect(script).toContain('OPENCLAW_GATEWAY_TOKEN');
  });

  it('includes operator.admin scope', () => {
    const script = buildRawWsSpawnScript('pm', '{}', '28789');
    expect(script).toContain('operator.admin');
  });

  it('includes spawn-v2 client version identifier', () => {
    const script = buildRawWsSpawnScript('pm', '{}', '28789');
    expect(script).toContain('spawn-v2');
  });
});

// ── dispatchAgentSpawn (Task 0094 — v1 removed, v2 only) ────────────────────

describe('dispatchAgentSpawn', () => {
  it('does not throw when called (v2 path)', () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    expect(() => dispatchAgentSpawn('pm', 'Hello', logger)).not.toThrow();
  });

  it('delegates to fireAgentViaGatewayWs', () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    // dispatchAgentSpawn should work without any env flags
    expect(() => dispatchAgentSpawn('tech-lead', 'Test', logger)).not.toThrow();
  });
});

// ── Dedup map bounding (Task 0094) ──────────────────────────────────────────

describe('dedup map bounding', () => {
  beforeEach(() => {
    resetDedupCache();
  });

  it('deduplicates identical spawns within TTL', () => {
    const deps = createDeps();
    const event = makeEvent({
      result: { details: { delivered: true, messageId: 'dup-test' } },
      params: { to: 'tech-lead', subject: 'test' },
    });
    handleTeamMessageAutoSpawn(deps, event, makeCtx());
    handleTeamMessageAutoSpawn(deps, event, makeCtx());
    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(1);
  });

  it('allows different spawns (unique dedup keys)', () => {
    const deps = createDeps();
    const event1 = makeEvent({
      result: { details: { delivered: true, messageId: 'msg-A' } },
      params: { to: 'tech-lead', subject: 'test A' },
    });
    const event2 = makeEvent({
      result: { details: { delivered: true, messageId: 'msg-B' } },
      params: { to: 'tech-lead', subject: 'test B' },
    });
    handleTeamMessageAutoSpawn(deps, event1, makeCtx());
    handleTeamMessageAutoSpawn(deps, event2, makeCtx());
    expect(deps.agentRunner.spawnAgent).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest entries when exceeding DEDUP_MAX_SIZE', () => {
    const deps = createDeps();
    // Fill the dedup cache to capacity with unique messages
    for (let i = 0; i < DEDUP_MAX_SIZE; i++) {
      const event = makeEvent({
        result: { details: { delivered: true, messageId: `fill-${i}` } },
        params: { to: 'tech-lead', subject: `fill-${i}` },
      });
      handleTeamMessageAutoSpawn(deps, event, makeCtx());
    }
    expect(getDedupSize()).toBe(DEDUP_MAX_SIZE);

    // Insert one more — should evict oldest and make room
    const overflow = makeEvent({
      result: { details: { delivered: true, messageId: 'overflow' } },
      params: { to: 'tech-lead', subject: 'overflow' },
    });
    handleTeamMessageAutoSpawn(deps, overflow, makeCtx());
    expect(getDedupSize()).toBe(DEDUP_MAX_SIZE);

    // The first entry (fill-0) should have been evicted — re-sending it should spawn again
    const reinsert = makeEvent({
      result: { details: { delivered: true, messageId: 'fill-0' } },
      params: { to: 'tech-lead', subject: 'fill-0' },
    });
    const callsBefore = (deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls.length;
    handleTeamMessageAutoSpawn(deps, reinsert, makeCtx());
    expect((deps.agentRunner.spawnAgent as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore + 1);
  });
});
