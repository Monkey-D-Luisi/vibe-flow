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

function validateCoverageByScope(
  raw: Record<string, unknown> | null,
): { minor?: number; major?: number; patch?: number } | undefined {
  if (!raw) return undefined;
  const result: { minor?: number; major?: number; patch?: number } = {};
  for (const key of ['minor', 'major', 'patch'] as const) {
    const val = raw[key];
    if (typeof val === 'number' && val >= 0 && val <= 100) {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
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
      enabled: asBoolean(prBot?.enabled) ?? true,
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
        agentId: asNonEmptyString(autoTransition?.agentId) ?? 'devops',
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

export interface OrchestratorConfig {
  readonly maxRetriesPerStage: number;
  readonly stageTimeouts: Record<string, number>;
  readonly skipDesignForNonUITasks: boolean;
  readonly autoEscalateAfterRetries: boolean;
  readonly notifyTelegramOnStageChange: boolean;
  readonly coverageByScope?: { minor?: number; major?: number; patch?: number };
  readonly stageQualityEnabled: boolean;
  readonly selfEvaluationEnabled: boolean;
  readonly maxReviewRounds: number;
  /** Custom pipeline stages (e.g. minimal 5-stage). Defaults to full 10-stage. */
  readonly pipelineStages?: readonly string[];
  /** Custom stage → agent owner mapping. Defaults to full stage owners. */
  readonly stageOwners?: Readonly<Record<string, string>>;
  /** Agents allowed to call pipeline.advance as coordinators (in addition to stage owner). */
  readonly coordinatorAgents?: readonly string[];
  /** Default escalation target agent (replaces hardcoded 'tech-lead'). */
  readonly escalationTarget?: string;
}

export function resolveOrchestratorConfig(
  pluginConfig: Record<string, unknown> | undefined,
): OrchestratorConfig {
  const orch = asRecord(pluginConfig?.orchestrator);
  const rawTimeouts = asRecord(orch?.stageTimeouts);
  const stageTimeouts: Record<string, number> = {};
  if (rawTimeouts) {
    for (const [stage, val] of Object.entries(rawTimeouts)) {
      const n = asPositiveInteger(val);
      if (n) stageTimeouts[stage] = n;
    }
  }
  return {
    maxRetriesPerStage: asPositiveInteger(orch?.maxRetriesPerStage) ?? 1,
    stageTimeouts,
    skipDesignForNonUITasks: asBoolean(orch?.skipDesignForNonUITasks) ?? false,
    autoEscalateAfterRetries: asBoolean(orch?.autoEscalateAfterRetries) ?? true,
    notifyTelegramOnStageChange: asBoolean(orch?.notifyTelegramOnStageChange) ?? false,
    coverageByScope: validateCoverageByScope(asRecord(orch?.coverageByScope)),
    stageQualityEnabled: asBoolean(orch?.stageQualityEnabled) ?? true,
    selfEvaluationEnabled: asBoolean(orch?.selfEvaluationEnabled) ?? true,
    maxReviewRounds: asPositiveInteger(orch?.maxReviewRounds) ?? 3,
    pipelineStages: asStringArray(orch?.pipelineStages).length > 0
      ? asStringArray(orch?.pipelineStages)
      : undefined,
    stageOwners: asRecord(orch?.stageOwners)
      ? Object.fromEntries(
          Object.entries(asRecord(orch?.stageOwners) as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k, v as string]),
        )
      : undefined,
    coordinatorAgents: asStringArray(orch?.coordinatorAgents).length > 0
      ? asStringArray(orch?.coordinatorAgents)
      : undefined,
    escalationTarget: asNonEmptyString(orch?.escalationTarget) ?? undefined,
  };
}

export interface Project {
  id: string;
  name: string;
  repo: string;
  workspace: string;
  defaultBranch?: string;
  stitch?: { projectId: string | null };
  quality?: { coverageMajor?: number; coverageMinor?: number; maxComplexity?: number };
  [key: string]: unknown;
}

export interface ProjectConfig {
  projects: Project[];
  activeProject: string;
}

export function resolveProjectConfig(
  pluginConfig: Record<string, unknown> | undefined,
): ProjectConfig {
  const raw = pluginConfig?.projects;
  const projects: Project[] = Array.isArray(raw)
    ? raw.filter((p): p is Project => {
        if (typeof p !== 'object' || p === null || Array.isArray(p)) return false;
        const rec = p as Record<string, unknown>;
        return typeof rec['id'] === 'string' && rec['id'].length > 0
          && typeof rec['repo'] === 'string'
          && typeof rec['workspace'] === 'string';
      })
    : [];
  const activeProject = asNonEmptyString(pluginConfig?.activeProject) ?? (projects[0]?.id ?? '');
  return { projects, activeProject };
}

// ── Delivery channel routing config ──────────────────────────────────────────

export type DeliveryMode = 'broadcast' | 'internal' | 'smart' | 'replies-only';

export interface DeliveryConfig {
  readonly defaultMode: DeliveryMode;
  readonly broadcastKeywords: readonly string[];
  readonly broadcastPriorities: readonly string[];
  readonly agents: Readonly<Record<string, { mode: DeliveryMode }>>;
  /** Maps agentId → Telegram account ID for agents with their own bot. */
  readonly agentAccounts: Readonly<Record<string, string>>;
}

const DEFAULT_BROADCAST_KEYWORDS: readonly string[] = [
  'decision', 'decisión', 'escalation', 'escalación', 'blocker',
  'review', 'revisión', 'approval', 'aprobación',
  'deploy', 'release', 'rollback', 'incident', 'incidencia', 'hotfix',
];

const DEFAULT_BROADCAST_PRIORITIES: readonly string[] = ['urgent'];

const VALID_DELIVERY_MODES = new Set<string>(['broadcast', 'internal', 'smart', 'replies-only']);

function asDeliveryMode(value: unknown): DeliveryMode | null {
  return typeof value === 'string' && VALID_DELIVERY_MODES.has(value)
    ? value as DeliveryMode
    : null;
}

export function resolveDeliveryConfig(
  pluginConfig: Record<string, unknown> | undefined,
): DeliveryConfig {
  const delivery = asRecord(pluginConfig?.delivery);
  const defaults = asRecord(delivery?.default);

  const defaultMode = asDeliveryMode(defaults?.mode) ?? 'smart';
  const broadcastKeywords = defaults?.broadcastKeywords
    ? asStringArray(defaults.broadcastKeywords)
    : [...DEFAULT_BROADCAST_KEYWORDS];
  const broadcastPriorities = defaults?.broadcastPriorities
    ? asStringArray(defaults.broadcastPriorities)
    : [...DEFAULT_BROADCAST_PRIORITIES];

  const rawAgents = asRecord(delivery?.agents);
  const agents: Record<string, { mode: DeliveryMode }> = {};
  if (rawAgents) {
    for (const [agentId, val] of Object.entries(rawAgents)) {
      const agentRec = asRecord(val);
      const mode = asDeliveryMode(agentRec?.mode);
      if (mode) {
        agents[agentId] = { mode };
      }
    }
  }

  const rawAccounts = asRecord(delivery?.agentAccounts);
  const agentAccounts: Record<string, string> = {};
  if (rawAccounts) {
    for (const [agentId, val] of Object.entries(rawAccounts)) {
      const acct = asNonEmptyString(val);
      if (acct) {
        agentAccounts[agentId] = acct;
      }
    }
  }

  return { defaultMode, broadcastKeywords, broadcastPriorities, agents, agentAccounts };
}
