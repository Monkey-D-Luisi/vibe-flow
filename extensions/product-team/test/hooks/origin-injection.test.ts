import { describe, it, expect } from 'vitest';
import { parseChannelFromSessionKey, injectOriginIntoTeamMessage } from '../../src/hooks/origin-injection.js';

describe('parseChannelFromSessionKey', () => {
  it('extracts telegram from group session key', () => {
    expect(parseChannelFromSessionKey('agent:pm:telegram:group:-5177552677')).toBe('telegram');
  });

  it('extracts telegram from DM session key', () => {
    expect(parseChannelFromSessionKey('agent:pm:telegram:dm:229000779')).toBe('telegram');
  });

  it('returns null for main session key', () => {
    expect(parseChannelFromSessionKey('agent:pm:main')).toBeNull();
  });

  it('returns null for unrecognised format', () => {
    expect(parseChannelFromSessionKey('some-random-key')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseChannelFromSessionKey('')).toBeNull();
  });

  it('extracts channel for non-telegram channels', () => {
    expect(parseChannelFromSessionKey('agent:pm:slack:channel:C12345')).toBe('slack');
  });
});

describe('injectOriginIntoTeamMessage', () => {
  const telegramCtx = {
    agentId: 'pm',
    sessionKey: 'agent:pm:telegram:group:-5177552677',
  };

  const mainCtx = {
    agentId: 'pm',
    sessionKey: 'agent:pm:main',
  };

  it('injects originChannel and originSessionKey for telegram session', () => {
    const event = {
      toolName: 'team_message',
      params: { to: 'tech-lead', subject: 'Test', body: 'Hello' },
    };
    const result = injectOriginIntoTeamMessage(event, telegramCtx);
    expect(result).toEqual({
      params: {
        to: 'tech-lead',
        subject: 'Test',
        body: 'Hello',
        originChannel: 'telegram',
        originSessionKey: 'agent:pm:telegram:group:-5177552677',
      },
    });
  });

  it('does not inject for non-team_message tools', () => {
    const event = {
      toolName: 'team_reply',
      params: { messageId: 'abc', body: 'Reply' },
    };
    expect(injectOriginIntoTeamMessage(event, telegramCtx)).toBeUndefined();
  });

  it('overrides LLM-provided originChannel with session context', () => {
    const event = {
      toolName: 'team_message',
      params: { to: 'tech-lead', subject: 'Test', body: 'Hello', originChannel: 'slack', originSessionKey: 'stale:value' },
    };
    const result = injectOriginIntoTeamMessage(event, telegramCtx);
    expect(result).toEqual({
      params: {
        to: 'tech-lead',
        subject: 'Test',
        body: 'Hello',
        originChannel: 'telegram',
        originSessionKey: 'agent:pm:telegram:group:-5177552677',
      },
    });
  });

  it('does not inject when sessionKey is undefined', () => {
    const event = {
      toolName: 'team_message',
      params: { to: 'tech-lead', subject: 'Test', body: 'Hello' },
    };
    expect(injectOriginIntoTeamMessage(event, { agentId: 'pm' })).toBeUndefined();
  });

  it('does not inject for main session (internal channel)', () => {
    const event = {
      toolName: 'team_message',
      params: { to: 'tech-lead', subject: 'Test', body: 'Hello' },
    };
    expect(injectOriginIntoTeamMessage(event, mainCtx)).toBeUndefined();
  });

  it('preserves all existing params when injecting', () => {
    const event = {
      toolName: 'team_message',
      params: { to: 'qa', subject: 'Review', body: 'Check this', priority: 'urgent', taskRef: 'TASK-001' },
    };
    const result = injectOriginIntoTeamMessage(event, telegramCtx);
    expect(result?.params).toMatchObject({
      to: 'qa',
      subject: 'Review',
      body: 'Check this',
      priority: 'urgent',
      taskRef: 'TASK-001',
      originChannel: 'telegram',
      originSessionKey: 'agent:pm:telegram:group:-5177552677',
    });
  });
});
