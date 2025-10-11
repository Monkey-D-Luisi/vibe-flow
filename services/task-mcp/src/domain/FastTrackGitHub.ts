import { FastTrackResult, PostDevGuardResult } from './FastTrack.js';
import { TaskRecord } from './TaskRecord.js';

type PullRequestParams = {
  title: string;
  head: string;
  base: string;
  body: string;
  draft: boolean;
  labels: string[];
};

type LabelParams = {
  number: number;
  labels: string[];
  type?: 'issue' | 'pr';
};

type CommentParams = {
  number: number;
  body: string;
  type?: 'issue' | 'pr';
};

type OpenPullRequestFn = (args: PullRequestParams) => Promise<{ number: number }>;
type AddLabelsFn = (args: LabelParams) => Promise<void>;
type CommentFn = (args: CommentParams) => Promise<void>;

const LABEL_FAST_TRACK = 'fast-track';
const LABEL_ELIGIBLE = 'fast-track:eligible';
const LABEL_BLOCKED = 'fast-track:blocked';
const LABEL_REVOKED = 'fast-track:revoked';

export class FastTrackGitHub {
  constructor(
    private readonly openPR: OpenPullRequestFn,
    private readonly addLabels: AddLabelsFn,
    private readonly comment: CommentFn
  ) {}

  async onFastTrackEvaluated(task: TaskRecord, result: FastTrackResult, prNumber?: number): Promise<void> {
    if (!prNumber) return;

    const labels = this.getLabelsForEvaluation(result);
    if (labels.length > 0) {
      await this.addLabels({ number: prNumber, labels, type: 'pr' });
    }

    await this.comment({
      number: prNumber,
      body: this.buildEvaluationComment(task, result),
      type: 'pr'
    });
  }

  async onFastTrackRevoked(task: TaskRecord, guardResult: PostDevGuardResult, prNumber?: number): Promise<void> {
    if (!prNumber || !guardResult.revoke) return;

    await this.addLabels({ number: prNumber, labels: [LABEL_FAST_TRACK, LABEL_REVOKED], type: 'pr' });

    await this.comment({
      number: prNumber,
      body: this.buildRevocationComment(task, guardResult),
      type: 'pr'
    });
  }

  async createFastTrackPR(task: TaskRecord, result: FastTrackResult, branchName: string, base = 'main'): Promise<{ number: number }> {
    return this.openPR({
      title: `${task.title} [FAST-TRACK]`,
      head: branchName,
      base,
      body: this.buildPullRequestBody(task, result),
      draft: result.eligible,
      labels: this.getLabelsForEvaluation(result)
    });
  }

  private getLabelsForEvaluation(result: FastTrackResult): string[] {
    return result.eligible
      ? [LABEL_FAST_TRACK, LABEL_ELIGIBLE]
      : [LABEL_FAST_TRACK, LABEL_BLOCKED];
  }

  private buildEvaluationComment(task: TaskRecord, result: FastTrackResult): string {
    const header = `## Fast-track evaluation for ${task.title}`;
    const summaryTable = [
      '| Metric | Value |',
      '| --- | --- |',
      `| Eligible | ${result.eligible ? 'YES' : 'NO'} |`,
      `| Score | ${result.score}/100 |`
    ].join('\n');

    const reasonsSection = result.reasons.length
      ? [``, '### Reasons', ...result.reasons.map(reason => `- ${this.formatReason(reason)}`)].join('\n')
      : '';

    const blocksSection = result.hardBlocks.length
      ? [``, '### Hard blocks', ...result.hardBlocks.map(block => `- ${this.formatHardBlock(block)}`)].join('\n')
      : '';

    const footer = result.eligible
      ? '\nFast-track approved. The task can move directly to Development.'
      : '\nFast-track blocked. Continue with the Architecture review path.';

    return [header, summaryTable, reasonsSection, blocksSection, footer].filter(Boolean).join('\n').trim();
  }

  private buildRevocationComment(task: TaskRecord, guardResult: PostDevGuardResult): string {
    return [
      `## Fast-track revoked for ${task.title}`,
      `**Reason:** ${this.formatRevocationReason(guardResult.reason ?? 'unknown')}`,
      '',
      'The task must continue through the standard Architecture review.',
      'Fast-track status was revoked after the development guard checks.'
    ].join('\n');
  }

  private buildPullRequestBody(task: TaskRecord, result: FastTrackResult): string {
    const eligibilitySection = result.eligible
      ? `**Fast-track score:** ${result.score}/100`
      : [
          '**Fast-track blocked**',
          result.hardBlocks.length ? result.hardBlocks.map(block => `- ${this.formatHardBlock(block)}`).join('\n') : 'No hard blocks reported.'
        ].join('\n');

    return [
      `## ${task.title}`,
      `**Task ID:** ${task.id}`,
      `**Scope:** ${task.scope}`,
      '',
      eligibilitySection,
      '',
      '**Acceptance criteria**',
      ...(task.acceptance_criteria ?? []).map(ac => `- ${ac}`)
    ].join('\n');
  }

  private formatReason(reason: string): string {
    const map: Record<string, string> = {
      scope_minor: 'Scope minor',
      diff_small: 'Diff <= 60 LOC',
      diff_medium: 'Diff <= 120 LOC',
      tests_docs_only: 'Only tests or documentation changed',
      coverage_strong: 'Coverage ≥ 85%',
      coverage_ok: 'Coverage ≥ 75%',
      complexity_ok: 'Cyclomatic complexity ≤ 5',
      lint_clean: 'Lint errors = 0',
      module_boundary_safe: 'Module boundaries unchanged',
      public_api_stable: 'Public API unchanged',
      no_code_changes: 'No code changes detected',
      eligible: 'Meets all criteria',
      score_below_threshold: 'Score below threshold'
    };
    return map[reason] ?? reason;
  }

  private formatHardBlock(code: string): string {
    const map: Record<string, string> = {
      public_api: 'Public API changed',
      modules_changed: 'Module boundaries changed',
      contracts_changed: 'Contracts changed',
      patterns_changed: 'Patterns changed',
      adr_changed: 'ADR changes detected',
      sensitive_path: 'Changes in sensitive paths (security/auth/payments/infra/migrations)',
      schema_change: 'Schema changes detected',
      lint_errors: 'Lint errors present'
    };
    return map[code] ?? code;
  }

  private formatRevocationReason(reason: string): string {
    const map: Record<string, string> = {
      public_api: 'Public API changed after development',
      modules_changed: 'Module boundaries changed after development',
      contracts_changed: 'Contracts changed after development',
      patterns_changed: 'Patterns changed after development',
      adr_changed: 'ADR changes detected',
      sensitive_path: 'Changes in sensitive paths detected after development',
      schema_change: 'Schema changes detected after development',
      lint_errors: 'Lint errors introduced during development',
      coverage_below_threshold: 'Coverage dropped below required threshold',
      high_violations: 'High-severity review violations detected',
      score_below_threshold: 'Fast-track score dropped below threshold'
    };
    return map[reason] ?? reason;
  }
}
