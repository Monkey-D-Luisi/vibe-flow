import type { TaskStatus } from '../domain/task-status.js';
import { ALL_STATUSES } from '../domain/task-status.js';
import type { CiFeedbackConfig } from '../github/ci-feedback.js';
import type { PrBotConfig } from '../github/pr-bot.js';

export interface GithubConfig {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBase: string;
  readonly timeoutMs: number;
  readonly prBot: PrBotConfig;
  readonly ciFeedback: CiFeedbackConfig;
}

export interface ConcurrencyConfig {
  readonly maxLeasesPerAgent: number;
  readonly maxTotalLeases: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeRoutePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return '/webhooks/github/ci';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function asTaskStatus(value: unknown): TaskStatus | null {
  if (typeof value !== 'string') {
    return null;
  }
  return (ALL_STATUSES as readonly string[]).includes(value) ? value as TaskStatus : null;
}

export function resolveGithubConfig(
  pluginConfig: Record<string, unknown> | undefined,
): GithubConfig {
  const github = asRecord(pluginConfig?.github);
  const prBot = asRecord(github?.prBot);
  const reviewers = asRecord(prBot?.reviewers);
  const ciFeedback = asRecord(github?.ciFeedback);
  const autoTransition = asRecord(ciFeedback?.autoTransition);
  const ciFeedbackEnabled = asBoolean(ciFeedback?.enabled) ?? false;
  const webhookSecret = asNonBlankString(ciFeedback?.webhookSecret);
  if (ciFeedbackEnabled && !webhookSecret) {
    throw new Error(
      'github.ciFeedback.webhookSecret must be configured when github.ciFeedback.enabled is true',
    );
  }
  const owner = asNonEmptyString(github?.owner) ?? 'local-owner';
  const repo = asNonEmptyString(github?.repo) ?? 'local-repo';
  return {
    owner,
    repo,
    defaultBase: asNonEmptyString(github?.defaultBase) ?? 'main',
    timeoutMs: asPositiveInteger(github?.timeoutMs) ?? 30_000,
    prBot: {
      enabled: typeof prBot?.enabled === 'boolean' ? prBot.enabled : true,
      reviewers: {
        default: asStringArray(reviewers?.default),
        major: asStringArray(reviewers?.major),
        minor: asStringArray(reviewers?.minor),
        patch: asStringArray(reviewers?.patch),
      },
    },
    ciFeedback: {
      enabled: ciFeedbackEnabled,
      routePath: normalizeRoutePath(
        asNonEmptyString(ciFeedback?.routePath) ?? '/webhooks/github/ci',
      ),
      webhookSecret: webhookSecret ?? '',
      expectedRepository: `${owner}/${repo}`,
      commentOnPr: asBoolean(ciFeedback?.commentOnPr) ?? true,
      autoTransition: {
        enabled: asBoolean(autoTransition?.enabled) ?? false,
        toStatus: asTaskStatus(autoTransition?.toStatus),
        agentId: asNonEmptyString(autoTransition?.agentId) ?? 'infra',
      },
    },
  };
}

export function resolveConcurrencyConfig(
  pluginConfig: Record<string, unknown> | undefined,
): ConcurrencyConfig {
  const workflow = asRecord(pluginConfig?.workflow);
  const concurrency = asRecord(workflow?.concurrency);
  return {
    maxLeasesPerAgent: asPositiveInteger(concurrency?.maxLeasesPerAgent) ?? 3,
    maxTotalLeases: asPositiveInteger(concurrency?.maxTotalLeases) ?? 10,
  };
}
