import type { TaskRecord } from '../domain/task-record.js';

export interface PrBotAfterToolCallEvent {
  readonly toolName: string;
  readonly params: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: string;
}

export interface PrBotHookContext {
  readonly toolName: string;
  readonly agentId?: string;
  readonly sessionKey?: string;
}

interface LabelInput {
  readonly name: string;
  readonly color: string;
  readonly description?: string;
}

interface PrBotTaskReader {
  getById(taskId: string): TaskRecord | null;
}

interface PrBotLabelService {
  syncLabels(input: { taskId: string; labels: LabelInput[] }): Promise<unknown>;
}

interface PrBotPrService {
  updateTaskPr(input: {
    taskId: string;
    prNumber: number;
    labels?: string[];
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
  }): Promise<unknown>;
}

interface PrBotGhClient {
  requestReviewers(prNumber: number, reviewers: string[]): Promise<void>;
  commentPr(prNumber: number, body: string): Promise<void>;
}

interface PrBotEventLog {
  logVcsEvent(
    taskId: string,
    eventType: `vcs.${string}`,
    agentId: string | null,
    payload: Record<string, unknown>,
  ): unknown;
}

interface PrBotLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
}

export interface PrBotReviewerConfig {
  readonly default: readonly string[];
  readonly major: readonly string[];
  readonly minor: readonly string[];
  readonly patch: readonly string[];
}

export interface PrBotConfig {
  readonly enabled: boolean;
  readonly reviewers: PrBotReviewerConfig;
}

export interface PrBotAutomationDeps {
  readonly taskReader: PrBotTaskReader;
  readonly labelService: PrBotLabelService;
  readonly prService: PrBotPrService;
  readonly ghClient: PrBotGhClient;
  readonly eventLog: PrBotEventLog;
  readonly logger: PrBotLogger;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly config: PrBotConfig;
}

interface PrCreateResult {
  readonly prNumber: number;
  readonly cached: boolean;
  readonly url?: string;
}

interface PrBotExecutionSummary {
  prNumber: number;
  cached: boolean;
  labelsApplied: string[];
  reviewersAssigned: string[];
  commentPosted: boolean;
  failures: string[];
  taskLink?: string;
}

const SCOPE_COLORS: Record<'major' | 'minor' | 'patch', string> = {
  major: 'd93f0b',
  minor: 'fbca04',
  patch: '0e8a16',
};

const EPIC_COLOR = '7057ff';
const AREA_COLOR = '006b75';
const REVIEWER_PATTERN = /^[A-Za-z0-9-]+(?:\/[A-Za-z0-9_.-]+)?$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function toLabelSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function toPrefixedLabel(prefix: 'epic' | 'area', value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith(`${prefix}:`)) {
    const suffix = trimmed.slice(prefix.length + 1).trim();
    return `${prefix}:${toLabelSlug(suffix)}`;
  }
  return `${prefix}:${toLabelSlug(trimmed)}`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizeReviewer(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return REVIEWER_PATTERN.test(trimmed) ? trimmed : null;
}

function extractMetadataLabels(task: TaskRecord): string[] {
  const labels: string[] = [`scope:${task.scope}`];
  const metadata = asRecord(task.metadata) ?? {};

  const tagLabels = asStringArray(task.tags);
  for (const tag of tagLabels) {
    const lowered = tag.toLowerCase();
    if (lowered.startsWith('epic:')) {
      labels.push(toPrefixedLabel('epic', tag));
    }
    if (lowered.startsWith('area:')) {
      labels.push(toPrefixedLabel('area', tag));
    }
  }

  const metadataEpic = asString(metadata.epic) ?? asString(metadata.epicId);
  if (metadataEpic) {
    labels.push(toPrefixedLabel('epic', metadataEpic));
  }

  const metadataArea = metadata.area;
  if (typeof metadataArea === 'string') {
    labels.push(toPrefixedLabel('area', metadataArea));
  } else if (Array.isArray(metadataArea)) {
    for (const item of metadataArea) {
      if (typeof item === 'string' && item.trim().length > 0) {
        labels.push(toPrefixedLabel('area', item));
      }
    }
  }

  return uniqueSorted(labels);
}

function toLabelInput(label: string): LabelInput {
  if (label.startsWith('scope:')) {
    const scope = label.slice('scope:'.length);
    if (scope === 'major' || scope === 'minor' || scope === 'patch') {
      return {
        name: label,
        color: SCOPE_COLORS[scope],
        description: `Task scope ${scope}`,
      };
    }
  }

  if (label.startsWith('epic:')) {
    return {
      name: label,
      color: EPIC_COLOR,
      description: 'Task epic',
    };
  }

  return {
    name: label,
    color: AREA_COLOR,
    description: 'Task area',
  };
}

function resolveReviewers(task: TaskRecord, config: PrBotConfig): string[] {
  const byScope = config.reviewers[task.scope];
  const values = [
    ...byScope,
    ...config.reviewers.default,
  ];

  const normalized = values
    .map((item) => normalizeReviewer(item))
    .filter((item): item is string => item !== null);

  return uniqueSorted(normalized);
}

function extractAcceptanceCriteria(task: TaskRecord): string[] {
  const metadata = asRecord(task.metadata) ?? {};
  const direct = asStringArray(metadata.acceptanceCriteria);
  if (direct.length > 0) {
    return direct;
  }

  const snakeCase = asStringArray(metadata.acceptance_criteria);
  if (snakeCase.length > 0) {
    return snakeCase;
  }

  const poBrief = asRecord(metadata.po_brief);
  if (!poBrief) {
    return [];
  }
  return asStringArray(poBrief.acceptance_criteria);
}

function resolveTaskLink(task: TaskRecord, owner: string, repo: string): string {
  const metadata = asRecord(task.metadata) ?? {};
  const directUrl = asString(metadata.taskUrl);
  if (directUrl) {
    return directUrl;
  }

  const taskPath = asString(metadata.taskPath);
  if (taskPath) {
    const normalized = taskPath.replace(/^\/+/, '');
    return `https://github.com/${owner}/${repo}/blob/main/${normalized}`;
  }

  return `https://github.com/${owner}/${repo}/search?q=${encodeURIComponent(task.id)}`;
}

function buildStatusComment(task: TaskRecord, taskLink: string): string {
  const criteria = extractAcceptanceCriteria(task);
  const checklistLines = criteria.length > 0
    ? criteria.map((criterion) => `- [ ] ${criterion}`)
    : [
      '- [ ] Confirm acceptance criteria',
      '- [ ] Run `pnpm test`',
      '- [ ] Run `pnpm lint`',
      '- [ ] Run `pnpm typecheck`',
      '- [ ] Update walkthrough/evidence',
    ];

  return [
    '## PR-Bot Status',
    '',
    `Task: [${task.id}](${taskLink})`,
    `Title: ${task.title}`,
    `Scope: ${task.scope}`,
    `Status: ${task.status}`,
    '',
    '### Checklist',
    ...checklistLines,
  ].join('\n');
}

function toPrCreateResult(value: unknown): PrCreateResult | null {
  const root = asRecord(value);
  if (!root) {
    return null;
  }

  const details = asRecord(root.details);
  const source = details ?? root;
  const numberValue = source.number;
  const prNumber = typeof numberValue === 'number'
    ? numberValue
    : typeof numberValue === 'string'
      ? Number.parseInt(numberValue, 10)
      : Number.NaN;

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return null;
  }

  const url = asString(source.url) ?? undefined;
  return {
    prNumber,
    cached: source.cached === true,
    url,
  };
}

export class PrBotAutomation {
  constructor(private readonly deps: PrBotAutomationDeps) {}

  async handleAfterToolCall(
    event: PrBotAfterToolCallEvent,
    ctx: PrBotHookContext,
  ): Promise<void> {
    if (!this.deps.config.enabled) {
      return;
    }
    if (event.toolName !== 'vcs.pr.create') {
      return;
    }
    if (event.error) {
      return;
    }

    const taskId = asString(event.params.taskId);
    if (!taskId) {
      this.deps.logger.warn('pr-bot skipped: missing taskId in vcs.pr.create params');
      return;
    }

    const result = toPrCreateResult(event.result);
    if (!result) {
      this.deps.logger.warn(`pr-bot skipped: invalid vcs.pr.create result for task ${taskId}`);
      return;
    }
    if (result.cached) {
      this.deps.eventLog.logVcsEvent(taskId, 'vcs.pr.bot', ctx.agentId ?? null, {
        prNumber: result.prNumber,
        skipped: true,
        reason: 'cached-pr-create-result',
      });
      return;
    }

    const task = this.deps.taskReader.getById(taskId);
    if (!task) {
      this.deps.logger.warn(`pr-bot skipped: task ${taskId} not found`);
      return;
    }

    const summary: PrBotExecutionSummary = {
      prNumber: result.prNumber,
      cached: false,
      labelsApplied: [],
      reviewersAssigned: [],
      commentPosted: false,
      failures: [],
    };

    const derivedLabels = extractMetadataLabels(task);
    if (derivedLabels.length > 0) {
      try {
        const labelInputs = derivedLabels.map((label) => toLabelInput(label));
        await this.deps.labelService.syncLabels({
          taskId,
          labels: labelInputs,
        });
        await this.deps.prService.updateTaskPr({
          taskId,
          prNumber: result.prNumber,
          labels: derivedLabels,
        });
        summary.labelsApplied = derivedLabels;
      } catch (error: unknown) {
        const message = `labels: ${String(error)}`;
        this.deps.logger.warn(`pr-bot automation failed (${message})`);
        summary.failures.push(message);
      }
    }

    const reviewers = resolveReviewers(task, this.deps.config);
    if (reviewers.length > 0) {
      try {
        await this.deps.ghClient.requestReviewers(result.prNumber, reviewers);
        summary.reviewersAssigned = reviewers;
      } catch (error: unknown) {
        const message = `reviewers: ${String(error)}`;
        this.deps.logger.warn(`pr-bot automation failed (${message})`);
        summary.failures.push(message);
      }
    }

    try {
      const taskLink = resolveTaskLink(task, this.deps.githubOwner, this.deps.githubRepo);
      const statusComment = buildStatusComment(task, taskLink);
      await this.deps.ghClient.commentPr(result.prNumber, statusComment);
      summary.commentPosted = true;
      summary.taskLink = taskLink;
    } catch (error: unknown) {
      const message = `comment: ${String(error)}`;
      this.deps.logger.warn(`pr-bot automation failed (${message})`);
      summary.failures.push(message);
    }

    this.deps.eventLog.logVcsEvent(taskId, 'vcs.pr.bot', ctx.agentId ?? null, {
      ...summary,
      prUrl: result.url,
    });
    this.deps.logger.info(
      `pr-bot processed PR #${result.prNumber} for task ${taskId} (labels=${summary.labelsApplied.length}, reviewers=${summary.reviewersAssigned.length}, comment=${summary.commentPosted})`,
    );
  }
}
