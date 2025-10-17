import { FastTrackResult, PostDevGuardResult } from './FastTrack.js';
import { TaskRecord } from './TaskRecord.js';
import { buildEvaluationComment, buildRevocationComment } from './fastTrackCommentBuilders.js';
import { GithubService } from '../github/service.js';

export type FastTrackLabels = {
  fastTrack: string;
  eligible: string;
  incompatible: string;
  revoked: string;
};

function resolveRepo(task: TaskRecord): { owner: string; repo: string } | null {
  const githubLink = task.links?.github;
  if (!githubLink?.owner || !githubLink?.repo) {
    return null;
  }
  return { owner: githubLink.owner, repo: githubLink.repo };
}

export class FastTrackGitHub {
  constructor(private readonly github: GithubService, private readonly labels: FastTrackLabels) {}

  async onFastTrackEvaluated(task: TaskRecord, result: FastTrackResult, prNumber?: number): Promise<void> {
    if (!prNumber) return;
    const repo = resolveRepo(task);
    if (!repo) return;

    const requestBase = `fasttrack:${task.id}:evaluated:${prNumber}`;
    const labelSet = this.getLabelsForEvaluation(result);
    if (labelSet.length > 0) {
      await this.github.addLabels({
        owner: repo.owner,
        repo: repo.repo,
        issueNumber: prNumber,
        labels: labelSet,
        requestId: `${requestBase}:labels`
      });
    }

    await this.github.comment({
      owner: repo.owner,
      repo: repo.repo,
      issueNumber: prNumber,
      body: buildEvaluationComment(task, result),
      requestId: `${requestBase}:comment`
    });
  }

  async onFastTrackRevoked(task: TaskRecord, guardResult: PostDevGuardResult, prNumber?: number): Promise<void> {
    if (!prNumber || !guardResult.revoke) return;
    const repo = resolveRepo(task);
    if (!repo) return;

    const requestBase = `fasttrack:${task.id}:revoked:${prNumber}`;
    await this.github.addLabels({
      owner: repo.owner,
      repo: repo.repo,
      issueNumber: prNumber,
      labels: [this.labels.fastTrack, this.labels.revoked],
      requestId: `${requestBase}:labels`
    });

    await this.github.comment({
      owner: repo.owner,
      repo: repo.repo,
      issueNumber: prNumber,
      body: buildRevocationComment(task, guardResult),
      requestId: `${requestBase}:comment`
    });
  }

  private getLabelsForEvaluation(result: FastTrackResult): string[] {
    return result.eligible
      ? [this.labels.fastTrack, this.labels.eligible]
      : [this.labels.fastTrack, this.labels.incompatible];
  }
}
