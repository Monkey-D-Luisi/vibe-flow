import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractDetails,
  buildSpawnDirective,
  handleTeamMessageAutoSpawn,
  handleDecisionEscalationAutoSpawn,
  registerAutoSpawnHooks,
  resetDedupCache,
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

// ── buildSpawnDirective ─────────────────────────────────────────────────────

describe('buildSpawnDirective', () => {
  it('builds a directive with default priority', () => {
    const directive = buildSpawnDirective({
      targetAgentId: 'tech-lead',
      task: 'Review the code',
      reason: 'Escalation required',
    });
    expect(directive).toContain('<system-directive priority="high">');
    expect(directive).toContain('sessions_spawn');
    expect(directive).toContain('"tech-lead"');
    expect(directive).toContain('Review the code');
    expect(directive).toContain('Escalation required');
    expect(directive).toContain('</system-directive>');
  });

  it('uses critical priority when specified', () => {
    const directive = buildSpawnDirective({
      targetAgentId: 'pm',
      task: 'Urgent review',
      reason: 'Critical decision',
      priority: 'critical',
    });
    expect(directive).toContain('<system-directive priority="critical">');
  });

  it('escapes double quotes in task', () => {
    const directive = buildSpawnDirective({
      targetAgentId: 'tech-lead',
      task: 'Review "important" changes',
      reason: 'Test',
    });
    expect(directive).toContain("Review 'important' changes");
    expect(directive).not.toContain('Review "important" changes');
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

// ── registerAutoSpawnHooks ──────────────────────────────────────────────────

describe('registerAutoSpawnHooks', () => {
  it('registers two after_tool_call hooks', () => {
    const mockRunner = { spawnAgent: vi.fn() };
    const api = {
      logger: { info: vi.fn(), warn: vi.fn() },
      on: vi.fn(),
    } as unknown as OpenClawPluginApi;

    const agents = [{ id: 'pm', name: 'PM' }];
    registerAutoSpawnHooks(api, agents, mockRunner);

    expect(api.on).toHaveBeenCalledTimes(2);
    expect((api.on as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('after_tool_call');
    expect((api.on as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe('after_tool_call');
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
