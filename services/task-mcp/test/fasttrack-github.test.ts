import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FastTrackGitHub } from '../src/domain/FastTrackGitHub.js';
import type { FastTrackResult, PostDevGuardResult } from '../src/domain/FastTrack.js';
import type { TaskRecord } from '../src/domain/TaskRecord.js';
import type { GithubService } from '../src/github/service.js';

const labels = {
  fastTrack: 'fast-track',
  eligible: 'fast-track:eligible',
  incompatible: 'fast-track:incompatible',
  revoked: 'fast-track:revoked'
};

describe('FastTrackGitHub', () => {
  let addLabelsSpy: ReturnType<typeof vi.fn>;
  let commentSpy: ReturnType<typeof vi.fn>;
  let github: FastTrackGitHub;
  let task: TaskRecord;

  beforeEach(() => {
    addLabelsSpy = vi.fn(async () => ({ applied: [] }));
    commentSpy = vi.fn(async () => ({ id: 1, url: 'comment' }));

    const service = {
      addLabels: addLabelsSpy,
      comment: commentSpy
    } as unknown as GithubService;

    github = new FastTrackGitHub(service, labels);

    task = {
      id: 'TR-FASTTRACK1234567890123456',
      title: 'Fast Track Task',
      acceptance_criteria: ['AC'],
      scope: 'minor',
      status: 'po',
      rev: 0,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      links: {
        github: { owner: 'acme', repo: 'project' },
        git: { branch: 'feature/x', prNumber: 10 }
      }
    } as TaskRecord;
  });

  it('publishes labels and comment when evaluation approves', async () => {
    const result: FastTrackResult = {
      eligible: true,
      score: 80,
      reasons: ['eligible'],
      hardBlocks: []
    };

    await github.onFastTrackEvaluated(task, result, 123);

    expect(addLabelsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'project',
        issueNumber: 123,
        labels: ['fast-track', 'fast-track:eligible']
      })
    );
    expect(commentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'project',
        issueNumber: 123,
        body: expect.stringContaining('Fast-track evaluation for Fast Track Task')
      })
    );
  });

  it('marks evaluation as blocked when not eligible', async () => {
    const result: FastTrackResult = {
      eligible: false,
      score: 20,
      reasons: ['score_below_threshold'],
      hardBlocks: ['modules_changed']
    };

    await github.onFastTrackEvaluated(task, result, 77);

    expect(addLabelsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['fast-track', 'fast-track:incompatible'] })
    );
    const body = commentSpy.mock.calls[0][0].body as string;
    expect(body).toContain('Fast-track blocked');
  });

  it('adds revoked label and comment when guard fails', async () => {
    const guard: PostDevGuardResult = { revoke: true, reason: 'coverage_below_threshold' };
    await github.onFastTrackRevoked(task, guard, 55);

    expect(addLabelsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['fast-track', 'fast-track:revoked'] })
    );
    const body = commentSpy.mock.calls[0][0].body as string;
    expect(body).toContain('Fast-track revoked for Fast Track Task');
  });
});
