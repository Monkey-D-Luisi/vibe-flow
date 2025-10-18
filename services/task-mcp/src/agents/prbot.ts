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

export class PrBotAgent {
  constructor(private readonly github: GithubService, private readonly config: GithubPrBotConfig) {}

  async run(task: TaskRecord): Promise<PrSummary> {
    const repo = this.resolveRepository(task);
    const branchName = this.buildBranchName(task);
    const baseBranch = this.config.defaultBase ?? 'main';

    await this.github.createBranch(this.buildBranchParams(task, repo.owner, repo.repo, branchName, baseBranch));

    const desiredLabels = this.computeDesiredLabels(task);
    const prResult = await this.github.openPullRequest(this.buildOpenPrParams(task, repo.owner, repo.repo, branchName, baseBranch, desiredLabels));

    if (desiredLabels.size > 0) {
      await this.github.addLabels(this.buildAddLabelsParams(task, repo.owner, repo.repo, prResult.number, desiredLabels));
    }

    const labelsToRemove = this.computeRemovableLabels(desiredLabels);
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
      const statusValue = this.resolveProjectStatus(task.status);
      if (statusValue) {
        await this.github.setProjectStatus(
          this.buildProjectStatusParams(task, repo.owner, repo.repo, prResult.number, statusValue)
        );
      }
    }

    if (task.status === 'pr' && !this.hasQualityGateFailure(task)) {
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
      requestId: this.requestId(task.id, `branch:${name}`)
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
    const body = this.buildPrBody(task);
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
      requestId: this.requestId(task.id, `remove-label:${label}`)
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
    const body = this.buildQualityComment(task);
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

  private buildPrBody(task: TaskRecord): string {
    const lines: string[] = [];
    lines.push(`## ${task.title}`);
    lines.push(`**Task ID:** ${task.id}`);
    lines.push(`**Scope:** ${task.scope}`);

    if (task.description) {
      lines.push('', '### Contexto', task.description);
    }

    lines.push('', '### ACs');
    for (const ac of task.acceptance_criteria ?? []) {
      lines.push(`- [ ] ${ac}`);
    }

    const coverageValue = formatPercentage(task.metrics?.coverage);
    const lintErrors = task.metrics?.lint?.errors ?? 'N/A';
    const qaSummary = task.qa_report
      ? `${task.qa_report.passed}/${task.qa_report.total} tests passed`
      : 'No QA report available';

    lines.push(
      '',
      '### Calidad',
      `- coverage: ${coverageValue}`,
      `- lint errors: ${lintErrors}`,
      `- RGR entries: ${task.red_green_refactor_log?.length ?? 0}`,
      `- QA: ${qaSummary}`
    );

    const issueNumber = task.links?.github?.issueNumber;
    if (issueNumber) {
      lines.push('', `Closes #${issueNumber}`);
    }

    return lines.join('\n');
  }

  private buildChecklist(task: TaskRecord): string[] {
    const checklist: string[] = [];
    const acCount = task.acceptance_criteria?.length ?? 0;
    checklist.push(`${acCount > 0 ? '[x]' : '[ ]'} ACs registrados (${acCount})`);

    const rgrCount = task.red_green_refactor_log?.length ?? 0;
    checklist.push(`${rgrCount >= 2 ? '[x]' : '[ ]'} RGR log (${rgrCount} entradas)`);

    const coverageTarget = task.scope === 'major' ? 0.8 : 0.7;
    const coverage = task.metrics?.coverage ?? 0;
    checklist.push(`${coverage >= coverageTarget ? '[x]' : '[ ]'} Coverage >= ${coverageTarget * 100}% (${formatPercentage(coverage)})`);

    const lintErrors = task.metrics?.lint?.errors ?? 0;
    checklist.push(`${lintErrors === 0 ? '[x]' : '[ ]'} Lint 0 errores (actual: ${lintErrors})`);

    const qaReport = task.qa_report;
    const qaPassed = qaReport ? qaReport.failed === 0 : false;
    checklist.push(`${qaPassed ? '[x]' : '[ ]'} QA sin fallos (${qaReport ? `${qaReport.passed}/${qaReport.total}` : 'sin datos'})`);

    return checklist;
  }

  private buildQualityComment(task: TaskRecord): string {
    const hasFailure = this.hasQualityGateFailure(task);
    const statusLine = hasFailure ? '? Quality gate failed' : '? Quality gate passed';
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

  private computeDesiredLabels(task: TaskRecord): Set<string> {
    const labels = new Set<string>();
    const cfg = this.config.labels ?? ({} as GithubPrBotConfig['labels']);
    const tags = new Set(task.tags ?? []);

    const add = (value?: string) => {
      if (value) {
        labels.add(value);
      }
    };

    // Base labels
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

  private sortLabels(labels: Iterable<string>): string[] {
    return Array.from(labels).sort();
  }


  private computeRemovableLabels(desired: Set<string>): string[] {
    const cfg = this.config.labels ?? ({} as GithubPrBotConfig['labels']);
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

  private resolveProjectStatus(status: TaskRecord['status']): string | null {
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


