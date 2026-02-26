import { describe, expect, it } from 'vitest';
import {
  resolveConcurrencyConfig,
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
          agentId: 'infra',
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
