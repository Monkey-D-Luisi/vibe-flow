import { describe, expect, it } from 'vitest';
import {
  resolveConcurrencyConfig,
  resolveDeliveryConfig,
  resolveGithubConfig,
} from '../../src/config/plugin-config.js';

describe('resolveGithubConfig', () => {
  it('applies defaults when github config is missing', () => {
    const result = resolveGithubConfig(undefined);

    expect(result).toEqual({
      owner: 'local-owner',
      repo: 'local-repo',
      defaultBase: 'main',
      timeoutMs: 30_000,
      prBot: {
        enabled: true,
        reviewers: {
          default: [],
          major: [],
          minor: [],
          patch: [],
        },
      },
      ciFeedback: {
        enabled: false,
        routePath: '/webhooks/github/ci',
        webhookSecret: '',
        expectedRepository: 'local-owner/local-repo',
        commentOnPr: true,
        autoTransition: {
          enabled: false,
          toStatus: null,
          agentId: 'devops',
        },
      },
    });
  });

  it('normalizes route path and reviewer lists', () => {
    const result = resolveGithubConfig({
      github: {
        owner: 'acme',
        repo: 'vibe-flow',
        prBot: {
          reviewers: {
            default: [' alice ', '', 'bob'],
            major: [' lead '],
          },
        },
        ciFeedback: {
          routePath: 'hooks/ci',
        },
      },
    });

    expect(result.prBot.reviewers).toEqual({
      default: ['alice', 'bob'],
      major: ['lead'],
      minor: [],
      patch: [],
    });
    expect(result.ciFeedback.routePath).toBe('/hooks/ci');
  });

  it('uses webhook secret verbatim and rejects missing secret when CI feedback is enabled', () => {
    const secret = '  keep-whitespace  ';
    const result = resolveGithubConfig({
      github: {
        ciFeedback: {
          enabled: true,
          webhookSecret: secret,
        },
      },
    });

    expect(result.ciFeedback.webhookSecret).toBe(secret);
    expect(() =>
      resolveGithubConfig({
        github: {
          ciFeedback: {
            enabled: true,
          },
        },
      }),
    ).toThrow(/webhookSecret must be configured/);
  });
});

describe('resolveConcurrencyConfig', () => {
  it('reads nested workflow.concurrency and ignores root-level concurrency', () => {
    const result = resolveConcurrencyConfig({
      workflow: {
        concurrency: {
          maxLeasesPerAgent: 2,
          maxTotalLeases: 5,
        },
      },
      concurrency: {
        maxLeasesPerAgent: 99,
        maxTotalLeases: 99,
      },
    });

    expect(result).toEqual({
      maxLeasesPerAgent: 2,
      maxTotalLeases: 5,
    });
  });
});

describe('resolveDeliveryConfig', () => {
  it('returns smart defaults when delivery config is missing', () => {
    const result = resolveDeliveryConfig(undefined);

    expect(result.defaultMode).toBe('smart');
    expect(result.broadcastPriorities).toEqual(['urgent']);
    expect(result.broadcastKeywords).toContain('decision');
    expect(result.broadcastKeywords).toContain('decisión');
    expect(result.broadcastKeywords).toContain('blocker');
    expect(result.broadcastKeywords).toHaveLength(15);
    expect(result.agents).toEqual({});
    expect(result.agentAccounts).toEqual({});
  });

  it('reads full config including per-agent overrides', () => {
    const result = resolveDeliveryConfig({
      delivery: {
        default: {
          mode: 'replies-only',
          broadcastKeywords: ['custom-kw'],
          broadcastPriorities: ['normal', 'urgent'],
        },
        agents: {
          pm: { mode: 'broadcast' },
          'back-1': { mode: 'internal' },
        },
      },
    });

    expect(result.defaultMode).toBe('replies-only');
    expect(result.broadcastKeywords).toEqual(['custom-kw']);
    expect(result.broadcastPriorities).toEqual(['normal', 'urgent']);
    expect(result.agents).toEqual({
      pm: { mode: 'broadcast' },
      'back-1': { mode: 'internal' },
    });
  });

  it('ignores invalid delivery modes in agent overrides', () => {
    const result = resolveDeliveryConfig({
      delivery: {
        agents: {
          pm: { mode: 'invalid-mode' },
          'tech-lead': { mode: 'smart' },
        },
      },
    });

    expect(result.agents['pm']).toBeUndefined();
    expect(result.agents['tech-lead']).toEqual({ mode: 'smart' });
  });

  it('falls back to smart when default mode is invalid', () => {
    const result = resolveDeliveryConfig({
      delivery: {
        default: { mode: 'nonexistent' },
      },
    });

    expect(result.defaultMode).toBe('smart');
  });

  it('reads agentAccounts mapping when present', () => {
    const result = resolveDeliveryConfig({
      delivery: {
        agentAccounts: {
          'tech-lead': 'tl',
          'designer': 'designer',
        },
      },
    });

    expect(result.agentAccounts).toEqual({
      'tech-lead': 'tl',
      'designer': 'designer',
    });
  });

  it('ignores empty and non-string agentAccounts values', () => {
    const result = resolveDeliveryConfig({
      delivery: {
        agentAccounts: {
          'tech-lead': 'tl',
          'bad-empty': '',
          'bad-number': 42,
          'bad-null': null,
        },
      },
    });

    expect(result.agentAccounts).toEqual({
      'tech-lead': 'tl',
    });
  });

  it('defaults agentAccounts to empty object when missing', () => {
    const result = resolveDeliveryConfig({
      delivery: {
        agents: { pm: { mode: 'broadcast' } },
      },
    });

    expect(result.agentAccounts).toEqual({});
  });
});
