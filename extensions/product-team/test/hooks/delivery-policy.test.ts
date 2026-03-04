import { describe, it, expect } from 'vitest';
import { shouldDeliver, getAgentDeliveryMode } from '../../src/hooks/delivery-policy.js';
import type { DeliveryConfig } from '../../src/config/plugin-config.js';

function createConfig(overrides?: Partial<DeliveryConfig>): DeliveryConfig {
  return {
    defaultMode: 'smart',
    broadcastKeywords: ['decision', 'escalation', 'blocker', 'review', 'approval', 'deploy', 'release', 'rollback', 'incident', 'hotfix'],
    broadcastPriorities: ['urgent'],
    agents: {},
    ...overrides,
  };
}

describe('getAgentDeliveryMode', () => {
  it('returns per-agent mode when configured', () => {
    const config = createConfig({ agents: { pm: { mode: 'broadcast' } } });
    expect(getAgentDeliveryMode(config, 'pm')).toBe('broadcast');
  });

  it('falls back to defaultMode when agent has no override', () => {
    const config = createConfig({ defaultMode: 'replies-only' });
    expect(getAgentDeliveryMode(config, 'unknown-agent')).toBe('replies-only');
  });
});

describe('shouldDeliver', () => {
  describe('broadcast mode', () => {
    it('always delivers regardless of message content', () => {
      const config = createConfig({ agents: { pm: { mode: 'broadcast' } } });
      const result = shouldDeliver(config, 'pm', { priority: 'low', subject: 'Trivial chat', isReply: false });
      expect(result.deliver).toBe(true);
      expect(result.reason).toContain('broadcast');
    });
  });

  describe('internal mode', () => {
    it('never delivers regardless of message content', () => {
      const config = createConfig({ agents: { 'back-1': { mode: 'internal' } } });
      const result = shouldDeliver(config, 'back-1', { priority: 'urgent', subject: 'Decision: critical blocker', isReply: true });
      expect(result.deliver).toBe(false);
      expect(result.reason).toContain('internal');
    });
  });

  describe('replies-only mode', () => {
    it('delivers when the message is a reply', () => {
      const config = createConfig({ agents: { 'tech-lead': { mode: 'replies-only' } } });
      const result = shouldDeliver(config, 'tech-lead', { priority: 'normal', subject: 'Re: Question', isReply: true });
      expect(result.deliver).toBe(true);
      expect(result.reason).toContain('reply');
    });

    it('does not deliver when the message is not a reply', () => {
      const config = createConfig({ agents: { 'tech-lead': { mode: 'replies-only' } } });
      const result = shouldDeliver(config, 'tech-lead', { priority: 'normal', subject: 'New topic', isReply: false });
      expect(result.deliver).toBe(false);
      expect(result.reason).toContain('not a reply');
    });
  });

  describe('smart mode', () => {
    it('delivers when priority is in broadcastPriorities', () => {
      const config = createConfig();
      const result = shouldDeliver(config, 'tech-lead', { priority: 'urgent', subject: 'Trivial subject', isReply: false });
      expect(result.deliver).toBe(true);
      expect(result.reason).toContain('priority');
    });

    it('delivers when subject contains a broadcast keyword', () => {
      const config = createConfig();
      const result = shouldDeliver(config, 'tech-lead', { priority: 'normal', subject: 'Decision: use REST or GraphQL', isReply: false });
      expect(result.deliver).toBe(true);
      expect(result.reason).toContain('keyword');
    });

    it('delivers when subject contains keyword case-insensitively', () => {
      const config = createConfig();
      const result = shouldDeliver(config, 'tech-lead', { priority: 'normal', subject: 'BLOCKER: CI pipeline broken', isReply: false });
      expect(result.deliver).toBe(true);
      expect(result.reason).toContain('blocker');
    });

    it('does not deliver when priority is normal and no keyword match', () => {
      const config = createConfig();
      const result = shouldDeliver(config, 'tech-lead', { priority: 'normal', subject: 'Quick question about formatting', isReply: false });
      expect(result.deliver).toBe(false);
      expect(result.reason).toContain('no priority or keyword match');
    });

    it('does not deliver for low priority without keyword', () => {
      const config = createConfig();
      const result = shouldDeliver(config, 'tech-lead', { priority: 'low', subject: 'Minor style nit', isReply: true });
      expect(result.deliver).toBe(false);
    });

    it('uses default config when agent has no override', () => {
      const config = createConfig({ defaultMode: 'smart' });
      const result = shouldDeliver(config, 'unregistered-agent', { priority: 'urgent', subject: 'Test', isReply: false });
      expect(result.deliver).toBe(true);
    });

    it('matches each default keyword', () => {
      const config = createConfig();
      const keywords = ['decision', 'escalation', 'blocker', 'review', 'approval', 'deploy', 'release', 'rollback', 'incident', 'hotfix'];
      for (const kw of keywords) {
        const result = shouldDeliver(config, 'qa', { priority: 'normal', subject: `About ${kw} process`, isReply: false });
        expect(result.deliver).toBe(true);
      }
    });
  });

  describe('custom keywords and priorities', () => {
    it('respects custom broadcastKeywords', () => {
      const config = createConfig({ broadcastKeywords: ['custom-trigger'] });
      const result = shouldDeliver(config, 'qa', { priority: 'normal', subject: 'custom-trigger detected', isReply: false });
      expect(result.deliver).toBe(true);
    });

    it('respects custom broadcastPriorities', () => {
      const config = createConfig({ broadcastPriorities: ['normal', 'urgent'] });
      const result = shouldDeliver(config, 'qa', { priority: 'normal', subject: 'Trivial', isReply: false });
      expect(result.deliver).toBe(true);
    });

    it('does not match removed keywords', () => {
      const config = createConfig({ broadcastKeywords: [] });
      const result = shouldDeliver(config, 'qa', { priority: 'normal', subject: 'Decision about API', isReply: false });
      expect(result.deliver).toBe(false);
    });
  });
});
