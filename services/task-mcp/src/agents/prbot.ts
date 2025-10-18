import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { fingerprint, normalizeForFingerprint } from '../utils/normalize.js';
import { TaskRecord } from '../domain/TaskRecord.js';
import { loadSchema } from '../utils/loadSchema.js';
import type {
  GithubService,
  CreateBranchParams,
  OpenPullRequestParams,
  CommentParams,
  AddLabelsParams,
  RemoveLabelParams,
  SetProjectStatusParams,
  ReadyForReviewParams,
  RequestReviewersParams
} from '../github/service.js';
import type { GithubPrBotConfig } from '../github/config.js';

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
addFormats(ajv);

const prSummaryValidator = ajv.compile(loadSchema('pr_summary.schema.json'));
// Limit slug to keep head refs short while leaving room for task IDs / ULIDs appended later.
const MAX_BRANCH_SLUG_LENGTH = 48;

export interface PrSummary {
  branch: string;
  pr_url: string;
  checklist: string[];
}

export interface PrBotRunContext {
  approvalsCount?: number;
  qaChecksPassed?: boolean;
  qaReportPassed?: boolean;
}

function ensurePrSummary(summary: unknown): PrSummary {
  if (!prSummaryValidator(summary)) {
    throw new Error(`PR summary validation failed: ${JSON.stringify(prSummaryValidator.errors)}`);
  }
  return summary as PrSummary;
}

function slugify(value: string, maxLength = MAX_BRANCH_SLUG_LENGTH): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength) || 'task';
}

function formatPercentage(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${Math.round(value * 100)}%`;
}

function splitReviewers(entries: string[] = []): { reviewers: string[]; teamReviewers: string[] } {
  const reviewers: string[] = [];
  const teamReviewers: string[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.startsWith('team/')) {
      const team = entry.slice('team/'.length).trim();
      if (team) {
        teamReviewers.push(team);
      }
    } else {
      reviewers.push(entry.trim());
    }
  }
  return {
    reviewers: unique(reviewers).sort(),
    teamReviewers: unique(teamReviewers).sort()
  };
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items.filter((item) => item !== undefined && item !== null)));
}

type ChecklistItem = { checked: boolean; label: string };

function abbreviateList(values: string[], maxVisible: number): string {
  if (values.length === 0) {
    return 'N/A';
  }
  if (values.length <= maxVisible) {
    return values.join(', ');
  }
  const visible = values.slice(0, maxVisible).join(', ');
  return `${visible}, ...`;
}

function resolveAdrReferences(task: TaskRecord): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (value: string | undefined) => {
    if (!value) return;
    const normalized = value.trim();
    if (!normalized) return;
    const upper = normalized.toUpperCase();
    if (seen.has(upper)) return;
    seen.add(upper);
    results.push(upper);
  };

  for (const adr of task.links?.adr ?? []) {
    pushUnique(adr);
  }

  const pattern = /\bADR-\d+\b/gi;
  const sources: string[] = [];
  if (typeof task.description === 'string') {
    sources.push(task.description);
  }
  for (const ac of task.acceptance_criteria ?? []) {
    sources.push(ac);
  }

  for (const source of sources) {
    const matches = source.match(pattern);
    if (!matches) continue;
    for (const match of matches) {
      pushUnique(match);
    }
  }

  return results;
}

function qaReportPassed(task: TaskRecord): boolean {
  const qaReport = task.qa_report;
  if (!qaReport) {
    return false;
  }
  if (typeof qaReport.failed !== 'number' || typeof qaReport.total !== 'number') {
    return false;
  }
  return qaReport.total > 0 && qaReport.failed === 0;
}

function computeChecklistItems(task: TaskRecord): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  const acCount = task.acceptance_criteria?.length ?? 0;
  const acApproved = task.acceptance_criteria_met === true || ['qa', 'pr', 'done'].includes(task.status);
  items.push({
    checked: acCount > 0 && acApproved,
    label: `ACs registrados (${acCount})`
  });

  const adrReferences = resolveAdrReferences(task);
  const adrLabel = adrReferences.length > 0 ? abbreviateList(adrReferences, 5) : 'N/A';
  items.push({
    checked: adrReferences.length > 0,
    label: `ADR referenciados (${adrLabel})`
  });

  const rgrCount = task.red_green_refactor_log?.length ?? 0;
  items.push({
    checked: rgrCount >= 2,
    label: `RGR log (entradas: ${rgrCount})`
  });

  const coverageTarget = task.scope === 'major' ? 0.8 : 0.7;
  const coverage = task.metrics?.coverage;
  const coverageOk = typeof coverage === 'number' && coverage >= coverageTarget;
  items.push({
    checked: coverageOk,
    label: `Coverage >= ${Math.round(coverageTarget * 100)}% (actual: ${formatPercentage(coverage)})`
  });

  const lintErrors = task.metrics?.lint?.errors;
  const lintOk = typeof lintErrors === 'number' ? lintErrors === 0 : false;
  const lintDisplay = typeof lintErrors === 'number' ? lintErrors : 'N/A';
  items.push({
    checked: lintOk,
    label: `Lint 0 errores (actual: ${lintDisplay})`
  });

  const qaReport = task.qa_report;
  const qaTotal = qaReport?.total ?? 0;
  const qaDisplay = qaReport ? `${qaReport.passed ?? 0}/${qaTotal}` : 'sin datos';
  items.push({
    checked: qaReportPassed(task),
    label: `QA sin fallos (${qaDisplay})`
  });

  return items;
}

function getReadySettings(config: GithubPrBotConfig): {
  requireQaPass: boolean;
  requireReviewApproval: boolean;
  minApprovals: number;
} {
  const ready = config.ready ?? {};
  const requireQaPass = ready.requireQaPass === true;
  const requireReviewApproval = ready.requireReviewApproval === true;
  const minApprovals = Math.max(0, ready.minApprovals ?? (requireReviewApproval ? 1 : 0));
  return { requireQaPass, requireReviewApproval, minApprovals };
}

function shouldPromoteToReady(
  task: TaskRecord,
  context: PrBotRunContext,
  config: GithubPrBotConfig,
  hasQualityGateFailure: boolean
): boolean {
  const allowedStatuses = new Set<TaskRecord['status']>(['pr', 'done']);
  if (!allowedStatuses.has(task.status) || hasQualityGateFailure) {
    return false;
  }
  const settings = getReadySettings(config);
  const reportPassed = context.qaReportPassed ?? qaReportPassed(task);
  const qaOk = settings.requireQaPass ? (reportPassed || context.qaChecksPassed === true) : true;
  const approvalsCount = context.approvalsCount ?? 0;
  const approvalsOk = settings.requireReviewApproval ? approvalsCount >= settings.minApprovals : true;
  return qaOk && approvalsOk;
}

function buildPrBodyMarkdown(task: TaskRecord): string {
  const lines: string[] = [];
  lines.push(`## ${task.title}`);
  lines.push(`**Task ID:** ${task.id}`);
  lines.push(`**Scope:** ${task.scope}`);

  lines.push('', '### Contexto', task.description ?? '');

  const checklistItems = computeChecklistItems(task);
  lines.push('', '### Checklist');
  for (const item of checklistItems) {
    lines.push(`- [${item.checked ? 'x' : ' '}] ${item.label}`);
  }

  if ((task.acceptance_criteria?.length ?? 0) > 0) {
    lines.push('', '### ACs');
    for (const ac of task.acceptance_criteria ?? []) {
      lines.push(`- ${ac}`);
    }
  }

  const coverageValue = formatPercentage(task.metrics?.coverage);
  const lintErrorsValue =
    typeof task.metrics?.lint?.errors === 'number' ? task.metrics.lint.errors : 'N/A';
  const qaSummary = task.qa_report
    ? `${task.qa_report.passed}/${task.qa_report.total} tests passed`
    : 'No QA report available';

  lines.push(
    '',
    '### Calidad (resumen)',
    `- coverage: ${coverageValue}`,
    `- lint errors: ${lintErrorsValue}`,
    `- RGR entries: ${task.red_green_refactor_log?.length ?? 0}`,
    `- QA: ${qaSummary}`
  );

  const issueNumber = task.links?.github?.issueNumber;
  if (issueNumber) {
    lines.push('', `Closes #${issueNumber}`);
  }

  return lines.join('\n');
}

function computeDesiredLabelsSet(task: TaskRecord, config: GithubPrBotConfig): Set<string> {
  const labels = new Set<string>();
  const cfg = config.labels ?? ({} as GithubPrBotConfig['labels']);
  const tags = new Set(task.tags ?? []);

  const add = (value?: string) => {
    if (value) {
      labels.add(value);
    }
  };

  add(cfg.areaGithub);
  add(cfg.agentPrBot);
  add(cfg.task);

  if (tags.has('fast-track')) {
    add(cfg.fastTrack);
  }
  if (tags.has('fast-track:eligible')) {
    add(cfg.fastTrackEligible);
  }
  if (tags.has('fast-track:blocked') || tags.has('fast-track:incompatible')) {
    add(cfg.fastTrackIncompatible);
  }
  if (tags.has('fast-track:revoked')) {
    add(cfg.fastTrackRevoked);
  }

  if (tags.has('quality_gate_failed')) {
    add(cfg.qualityFailed);
  }

  switch (task.status) {
    case 'review':
    case 'po_check':
    case 'pr':
      add(cfg.inReview);
      break;
    case 'qa':
      add(cfg.readyForQa);
      break;
    default:
      break;
  }

  return labels;
}

function computeRemovableLabelsList(desired: Set<string>, config: GithubPrBotConfig): string[] {
  const cfg = config.labels ?? ({} as GithubPrBotConfig['labels']);
  const managed = unique([
    cfg.fastTrack,
    cfg.fastTrackEligible,
    cfg.fastTrackIncompatible,
    cfg.fastTrackRevoked,
    cfg.qualityFailed,
    cfg.inReview,
    cfg.readyForQa
  ]);
  return managed.filter((label) => label && !desired.has(label)).sort();
}

function resolveProjectStatusValue(status: TaskRecord['status']): string | null {
  switch (status) {
    case 'po':
    case 'arch':
    case 'dev':
      return 'In Progress';
    case 'review':
    case 'po_check':
    case 'qa':
    case 'pr':
      return 'In Review';
    case 'done':
      return 'Done';
    default:
      return null;
  }
}

function composeQualityComment(task: TaskRecord, hasFailure: boolean): string {
  const statusLine = hasFailure ? '✖ Quality gate failed' : '✔ Quality gate passed';
  const coverage = formatPercentage(task.metrics?.coverage);
  const lintErrors = task.metrics?.lint?.errors ?? 'N/A';
  const qaSummary = task.qa_report
    ? `${task.qa_report.passed}/${task.qa_report.total} tests passed`
    : 'No QA report captured';
  const rgrEntries = task.red_green_refactor_log?.length ?? 0;

  return [
    '## Quality gate summary',
    statusLine,
    '',
    `- coverage: ${coverage}`,
    `- lint errors: ${lintErrors}`,
    `- QA: ${qaSummary}`,
    `- RGR entries: ${rgrEntries}`
  ].join('\n');
}

export class PrBotAgent {
  constructor(private readonly github: GithubService, private readonly config: GithubPrBotConfig) {}

  async run(task: TaskRecord, context: PrBotRunContext = {}): Promise<PrSummary> {
    const repo = this.resolveRepository(task);
    const branchName = this.buildBranchName(task);
    const baseBranch = this.config.defaultBase ?? 'main';

    await this.github.createBranch(this.buildBranchParams(task, repo.owner, repo.repo, branchName, baseBranch));

    const desiredLabels = computeDesiredLabelsSet(task, this.config);
    const prResult = await this.github.openPullRequest(this.buildOpenPrParams(task, repo.owner, repo.repo, branchName, baseBranch, desiredLabels));

    if (desiredLabels.size > 0) {
      await this.github.addLabels(this.buildAddLabelsParams(task, repo.owner, repo.repo, prResult.number, desiredLabels));
    }

    const labelsToRemove = computeRemovableLabelsList(desiredLabels, this.config);
    for (const label of labelsToRemove) {
      await this.github.removeLabel(this.buildRemoveLabelParams(task, repo.owner, repo.repo, prResult.number, label));
    }

    if (this.config.reviewers?.length) {
      const { reviewers, teamReviewers } = splitReviewers(this.config.reviewers);
      if (reviewers.length > 0 || teamReviewers.length > 0) {
        await this.github.requestReviewers(
          this.buildRequestReviewersParams(task, repo.owner, repo.repo, prResult.number, reviewers, teamReviewers)
        );
      }
    }

    await this.github.comment(this.buildQualityCommentParams(task, repo.owner, repo.repo, prResult.number));

    if (this.config.project?.id) {
      const statusValue = resolveProjectStatusValue(task.status);
      if (statusValue) {
        await this.github.setProjectStatus(
          this.buildProjectStatusParams(task, repo.owner, repo.repo, prResult.number, statusValue)
        );
      }
    }

    const qualityGateFailed = this.hasQualityGateFailure(task);
    if (shouldPromoteToReady(task, context, this.config, qualityGateFailed)) {
      await this.github.markReadyForReview(this.buildReadyForReviewParams(task, repo.owner, repo.repo, prResult.number));
    }

    const summary = {
      branch: branchName,
      pr_url: prResult.url,
      checklist: this.buildChecklist(task)
    } satisfies PrSummary;

    return ensurePrSummary(summary);
  }

  private resolveRepository(task: TaskRecord): { owner: string; repo: string; issueNumber?: number } {
    const gh = task.links?.github;
    if (!gh?.owner || !gh?.repo) {
      throw new Error(`Task ${task.id} is missing links.github owner/repo`);
    }
    return { owner: gh.owner, repo: gh.repo, issueNumber: gh.issueNumber };
  }

  private buildBranchName(task: TaskRecord): string {
    const slug = slugify(task.title ?? task.id);
    return `feature/${task.id.toLowerCase()}-${slug}`;
  }

  private buildBranchParams(
    task: TaskRecord,
    owner: string,
    repo: string,
    name: string,
    base: string
  ): CreateBranchParams {
    return {
      owner,
      repo,
      base,
      name,
      protect: false,
      requestId: this.requestId(task.id, `branch:${base}:${name}`)
    };
  }

  private buildOpenPrParams(
    task: TaskRecord,
    owner: string,
    repo: string,
    head: string,
    base: string,
    desiredLabels: Set<string>
  ): OpenPullRequestParams {
    const body = buildPrBodyMarkdown(task);
    const labels = this.sortLabels(desiredLabels);
    const assignees = unique(this.config.assignees ?? []);
    return {
      owner,
      repo,
      title: this.buildPrTitle(task),
      head,
      base,
      body,
      draft: true,
      labels,
      assignees,
      linkTaskId: task.id,
      requestId: this.requestId(task.id, 'open-pr', { head, base, labels, assignees })
    };
  }

  private buildAddLabelsParams(
    task: TaskRecord,
    owner: string,
    repo: string,
    issueNumber: number,
    labels: Set<string>
  ): AddLabelsParams {
    const sortedLabels = this.sortLabels(labels);
    return {
      owner,
      repo,
      issueNumber,
      labels: sortedLabels,
      requestId: this.requestId(task.id, `labels:${issueNumber}`, sortedLabels)
    };
  }

  private buildRemoveLabelParams(
    task: TaskRecord,
    owner: string,
    repo: string,
    issueNumber: number,
    label: string
  ): RemoveLabelParams {
    return {
      owner,
      repo,
      issueNumber,
      label,
      requestId: this.requestId(task.id, `remove-label:${issueNumber}`, label)
    };
  }

  private buildProjectStatusParams(
    task: TaskRecord,
    owner: string,
    repo: string,
    issueNumber: number,
    value: string
  ): SetProjectStatusParams {
    return {
      owner,
      repo,
      issueNumber,
      project: {
        id: this.config.project!.id,
        field: this.config.project!.statusField,
        value
      },
      requestId: this.requestId(task.id, `project-status:${issueNumber}`, {
        id: this.config.project!.id,
        field: this.config.project!.statusField,
        value
      })
    };
  }

  private buildReadyForReviewParams(
    task: TaskRecord,
    owner: string,
    repo: string,
    pullNumber: number
  ): ReadyForReviewParams {
    return {
      owner,
      repo,
      pullNumber,
      requestId: this.requestId(task.id, `ready-for-review:${pullNumber}`)
    };
  }

  private buildRequestReviewersParams(
    task: TaskRecord,
    owner: string,
    repo: string,
    pullNumber: number,
    reviewers: string[],
    teamReviewers: string[]
  ): RequestReviewersParams {
    return {
      owner,
      repo,
      pullNumber,
      reviewers,
      teamReviewers,
      requestId: this.requestId(task.id, `reviewers:${pullNumber}`, {
        reviewers,
        teamReviewers
      })
    };
  }

  private buildQualityCommentParams(
    task: TaskRecord,
    owner: string,
    repo: string,
    issueNumber: number
  ): CommentParams {
    const body = composeQualityComment(task, this.hasQualityGateFailure(task));
    return {
      owner,
      repo,
      issueNumber,
      body,
      requestId: this.requestId(task.id, `quality-comment:${issueNumber}`, body)
    } satisfies CommentParams;
  }

  private buildPrTitle(task: TaskRecord): string {
    return `${task.id}: ${task.title} (scope: ${task.scope})`;
  }

  private buildChecklist(task: TaskRecord): string[] {
    return computeChecklistItems(task).map((item) => `[${item.checked ? 'x' : ' '}] ${item.label}`);
  }


  private sortLabels(labels: Iterable<string>): string[] {
    return Array.from(labels).sort();
  }


  private hasQualityGateFailure(task: TaskRecord): boolean {
    return (task.tags ?? []).includes('quality_gate_failed');
  }

  private requestId(taskId: string, action: string, payload?: unknown): string {
    const normalized = action.replace(/[^a-zA-Z0-9:_-]/g, '-');
    if (payload === undefined) {
      return `prbot:${taskId}:${normalized}`;
    }
    const hash = fingerprint(normalizeForFingerprint(payload));
    return `prbot:${taskId}:${normalized}:${hash}`;
  }
}

export { ensurePrSummary as validatePrSummary };


