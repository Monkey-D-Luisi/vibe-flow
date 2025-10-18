import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface GithubPrBotConfig {
  defaultBase: string;
  project?: {
    id: string;
    statusField: string;
  };
  labels: {
    fastTrack: string;
    fastTrackEligible: string;
    fastTrackIncompatible: string;
    fastTrackRevoked: string;
    qualityFailed: string;
    inReview?: string;
    readyForQa?: string;
    areaGithub?: string;
    agentPrBot?: string;
    task?: string;
  };
  assignees: string[];
  reviewers: string[];
  gateCheckName: string;
  ready?: {
    requireQaPass?: boolean;
    requireReviewApproval?: boolean;
    minApprovals?: number;
  };
  checks?: {
    qaWorkflowNames?: string[];
  };
}

let cachedConfig: GithubPrBotConfig | null = null;

function resolveDefaultPath(): string {
  const base = dirname(fileURLToPath(import.meta.url));
  return resolve(base, '../../config/github.pr-bot.json');
}

function parseConfig(raw: string): GithubPrBotConfig {
  const parsed = JSON.parse(raw) as GithubPrBotConfig;
  if (!parsed.defaultBase) {
    throw new Error('github.pr-bot config missing defaultBase');
  }
  if (!parsed.labels) {
    throw new Error('github.pr-bot config missing labels section');
  }
  if (!parsed.gateCheckName) {
    throw new Error('github.pr-bot config missing gateCheckName');
  }
  parsed.assignees ??= [];
  parsed.reviewers ??= [];
  parsed.ready ??= {};
  parsed.ready.requireQaPass ??= false;
  parsed.ready.requireReviewApproval ??= false;
  if (parsed.ready.minApprovals === undefined || parsed.ready.minApprovals === null) {
    parsed.ready.minApprovals = parsed.ready.requireReviewApproval ? 1 : 0;
  }
  if (parsed.ready.minApprovals < 0) {
    throw new Error('github.pr-bot config minApprovals must be >= 0');
  }
  parsed.checks ??= {};
  parsed.checks.qaWorkflowNames ??= [];
  return parsed;
}

export function loadGithubPrBotConfig(customPath?: string): GithubPrBotConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const overridePath = customPath ?? process.env.GITHUB_PR_BOT_CONFIG;
  const path = resolve(overridePath ?? resolveDefaultPath());
  const raw = readFileSync(path, 'utf8');
  cachedConfig = parseConfig(raw);
  return cachedConfig;
}

export function resetGithubPrBotConfigCache(): void {
  cachedConfig = null;
}
