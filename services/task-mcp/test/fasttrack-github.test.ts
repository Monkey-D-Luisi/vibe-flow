import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FastTrackGitHub } from '../src/domain/FastTrackGitHub.js';
import { type FastTrackResult, type PostDevGuardResult } from '../src/domain/FastTrack.js';
import { type TaskRecord } from '../src/domain/TaskRecord.js';

describe('FastTrackGitHub helpers', () => {
  let github: FastTrackGitHub;
  let addLabels: ReturnType<typeof vi.fn>;
  let comment: ReturnType<typeof vi.fn>;
  let openPR: ReturnType<typeof vi.fn>;
  let task: TaskRecord;

  beforeEach(() => {
    addLabels = vi.fn();
    comment = vi.fn();
    openPR = vi.fn();
    github = new FastTrackGitHub(openPR, addLabels, comment);
    task = {
      id: 'TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C',
      title: 'Fast Track Task',
      acceptance_criteria: ['AC'],
      scope: 'minor',
      status: 'po',
      rev: 0,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString()
    };
  });

  it('publishes labels and comment when evaluation approves', async () => {
    const result: FastTrackResult = {
      eligible: true,
      score: 80,
      reasons: ['eligible'],
      hardBlocks: []
    };

    await github.onFastTrackEvaluated(task, result, 123);

    expect(addLabels).toHaveBeenCalledWith({ number: 123, labels: ['fast-track', 'fast-track:eligible'], type: 'pr' });
    expect(comment).toHaveBeenCalledWith({
      number: 123,
      type: 'pr',
      body: expect.stringContaining('Fast-track evaluation for Fast Track Task')
    });
  });

  it('marks evaluation as blocked when hard rules trigger', async () => {
    const result: FastTrackResult = {
      eligible: false,
      score: 20,
      reasons: ['score_below_threshold'],
      hardBlocks: ['modules_changed']
    };

    await github.onFastTrackEvaluated(task, result, 77);

    expect(addLabels).toHaveBeenCalledWith({ number: 77, labels: ['fast-track', 'fast-track:blocked'], type: 'pr' });
    const body = comment.mock.calls[0][0].body;
    expect(body).toContain('Fast-track blocked');
    expect(body).toContain('Module boundaries changed');
  });

  it('adds revoked label and comment when guard fails', async () => {
    const guard: PostDevGuardResult = { revoke: true, reason: 'coverage_below_threshold' };
    await github.onFastTrackRevoked(task, guard, 55);

    expect(addLabels).toHaveBeenCalledWith({ number: 55, labels: ['fast-track:revoked'], type: 'pr' });
    const body = comment.mock.calls[0][0].body;
    expect(body).toContain('Fast-track revoked for Fast Track Task');
    expect(body).toContain('Coverage dropped below required threshold');
  });

  it('opens draft PR with fast-track labels when eligible', async () => {
    openPR.mockResolvedValue({ number: 999 });
    const result: FastTrackResult = {
      eligible: true,
      score: 70,
      reasons: ['eligible'],
      hardBlocks: []
    };

    await github.createFastTrackPR(task, result, 'feature/fast');

    expect(openPR).toHaveBeenCalledWith({
      title: 'Fast Track Task [FAST-TRACK]',
      head: 'feature/fast',
      base: 'main',
      body: expect.stringContaining('Fast-track score'),
      draft: true,
      labels: ['fast-track', 'fast-track:eligible']
    });
  });
});
