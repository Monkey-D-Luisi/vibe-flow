import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrBotAgent, validatePrSummary } from '../src/agents/prbot.js';
import type { GithubService } from '../src/github/service.js';
import type { GithubPrBotConfig } from '../src/github/config.js';
import type { TaskRecord } from '../src/domain/TaskRecord.js';

const config: GithubPrBotConfig = {
  defaultBase: 'main',
  project: { id: 'PVT_test', statusField: 'Status' },
  labels: {
    fastTrack: 'fast-track',
    fastTrackEligible: 'fast-track:eligible',
    fastTrackIncompatible: 'fast-track:incompatible',
    fastTrackRevoked: 'fast-track:revoked',
    qualityFailed: 'quality_gate_failed',
    inReview: 'in-review',
    readyForQa: 'ready-for-qa',
    areaGithub: 'area_github',
    agentPrBot: 'agent_pr-bot',
    task: 'task'
  },
  assignees: ['monkey-d-luisi'],
  reviewers: ['team/devs'],
  gateCheckName: 'quality-gate'
};

const baseTask: TaskRecord = {
  id: 'TR-TEST12345678901234567890',
  title: 'Implement login flow',
  description: 'Implement the login flow with MFA support',
  acceptance_criteria: ['Users can login with email/password', 'Users receive MFA challenge'],
  scope: 'minor',
  status: 'pr',
  rev: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  tags: ['fast-track', 'fast-track:eligible'],
  metrics: {
    coverage: 0.82,
    lint: { errors: 0, warnings: 1 }
  },
  qa_report: { total: 12, passed: 12, failed: 0 },
  red_green_refactor_log: ['red: failing test', 'green: implementation', 'refactor: cleanup'],
  links: {
    github: { owner: 'acme', repo: 'project', issueNumber: 7 }
  }
};

function cloneTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    ...baseTask,
    ...overrides,
    acceptance_criteria: overrides.acceptance_criteria ?? [...baseTask.acceptance_criteria],
    tags: overrides.tags ?? [...(baseTask.tags ?? [])],
    metrics: overrides.metrics ? { ...overrides.metrics } : { ...(baseTask.metrics ?? {}) },
    qa_report: overrides.qa_report ? { ...overrides.qa_report } : baseTask.qa_report ? { ...baseTask.qa_report } : undefined,
    red_green_refactor_log: overrides.red_green_refactor_log
      ? [...overrides.red_green_refactor_log]
      : [...(baseTask.red_green_refactor_log ?? [])],
    links: {
      ...(baseTask.links ?? {}),
      ...(overrides.links ?? {}),
      github: overrides.links?.github ? { ...(baseTask.links?.github ?? {}), ...overrides.links.github } : baseTask.links?.github
    }
  };
}

describe('PrBotAgent', () => {
  let createBranchSpy: ReturnType<typeof vi.fn>;
  let openPrSpy: ReturnType<typeof vi.fn>;
  let addLabelsSpy: ReturnType<typeof vi.fn>;
  let removeLabelSpy: ReturnType<typeof vi.fn>;
  let requestReviewersSpy: ReturnType<typeof vi.fn>;
  let setProjectStatusSpy: ReturnType<typeof vi.fn>;
  let markReadySpy: ReturnType<typeof vi.fn>;
  let commentSpy: ReturnType<typeof vi.fn>;
  let agent: PrBotAgent;

  beforeEach(() => {
    createBranchSpy = vi.fn(async () => ({ url: 'branch-url', commit: 'sha', created: true }));
    openPrSpy = vi.fn(async () => ({ number: 123, url: 'https://github.com/acme/project/pull/123', draft: true }));
    addLabelsSpy = vi.fn(async () => ({ applied: [] }));
    removeLabelSpy = vi.fn(async () => ({ removed: true }));
    requestReviewersSpy = vi.fn(async () => ({ requested: [] }));
    setProjectStatusSpy = vi.fn(async () => ({ ok: true }));
    markReadySpy = vi.fn(async () => ({ draft: false, updated: true }));
    commentSpy = vi.fn(async () => ({ id: 99, url: 'https://example.com/comment' }));

    const github = {
      createBranch: createBranchSpy,
      openPullRequest: openPrSpy,
      addLabels: addLabelsSpy,
      removeLabel: removeLabelSpy,
      requestReviewers: requestReviewersSpy,
      setProjectStatus: setProjectStatusSpy,
      markReadyForReview: markReadySpy,
      comment: commentSpy
    } as unknown as GithubService;

    agent = new PrBotAgent(github, config);
  });

  it('creates branch, opens PR, and synchronizes labels/project/reviewers', async () => {
    const task = cloneTask();

    const summary = await agent.run(task);

    expect(summary.branch).toMatch(/^feature\/tr-test/);
    expect(summary.pr_url).toBe('https://github.com/acme/project/pull/123');
    expect(summary.checklist.length).toBeGreaterThan(0);
    expect(() => validatePrSummary(summary)).not.toThrow();

    expect(createBranchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'project', base: 'main', name: summary.branch })
    );

    expect(openPrSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'project',
        head: summary.branch,
        base: 'main',
        draft: true,
        assignees: ['monkey-d-luisi'],
        labels: expect.arrayContaining(['fast-track', 'fast-track:eligible', 'area_github'])
      })
    );

    expect(addLabelsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'project',
        issueNumber: 123,
        labels: expect.arrayContaining(['fast-track', 'fast-track:eligible', 'in-review'])
      })
    );

    const removedLabels = removeLabelSpy.mock.calls.map((call) => call[0].label);
    expect(removedLabels).toEqual(
      expect.arrayContaining(['fast-track:incompatible', 'fast-track:revoked', 'quality_gate_failed', 'ready-for-qa'])
    );

    expect(requestReviewersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'project',
        pullNumber: 123,
        reviewers: [],
        teamReviewers: ['devs']
      })
    );

    expect(setProjectStatusSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'project',
        issueNumber: 123,
        project: expect.objectContaining({ value: 'In Review' })
      })
    );

    expect(markReadySpy).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'project', pullNumber: 123 })
    );

    expect(commentSpy).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'project', issueNumber: 123 })
    );
  });

  it('skips ready-for-review when quality gate failed', async () => {
    const task = cloneTask({ tags: ['quality_gate_failed'], status: 'review' });
    await agent.run(task);
    expect(markReadySpy).not.toHaveBeenCalled();
  });
});
