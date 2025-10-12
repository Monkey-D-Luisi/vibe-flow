import { FastTrackResult, PostDevGuardResult } from './FastTrack.js';
import { TaskRecord } from './TaskRecord.js';
import { buildEvaluationComment, buildRevocationComment, buildPullRequestBody } from './fastTrackCommentBuilders.js';

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
      body: buildEvaluationComment(task, result),
      type: 'pr'
    });
  }

  async onFastTrackRevoked(task: TaskRecord, guardResult: PostDevGuardResult, prNumber?: number): Promise<void> {
    if (!prNumber || !guardResult.revoke) return;

    await this.addLabels({ number: prNumber, labels: [LABEL_FAST_TRACK, LABEL_REVOKED], type: 'pr' });

    await this.comment({
      number: prNumber,
      body: buildRevocationComment(task, guardResult),
      type: 'pr'
    });
  }

  async createFastTrackPR(task: TaskRecord, result: FastTrackResult, branchName: string, base = 'main'): Promise<{ number: number }> {
    return this.openPR({
      title: `${task.title} [FAST-TRACK]`,
      head: branchName,
      base,
      body: buildPullRequestBody(task, result),
      draft: result.eligible,
      labels: this.getLabelsForEvaluation(result)
    });
  }

  private getLabelsForEvaluation(result: FastTrackResult): string[] {
    return result.eligible
      ? [LABEL_FAST_TRACK, LABEL_ELIGIBLE]
      : [LABEL_FAST_TRACK, LABEL_BLOCKED];
  }
}
