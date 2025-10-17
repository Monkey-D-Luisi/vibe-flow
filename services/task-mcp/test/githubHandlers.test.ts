import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleGithubCreateBranch,
  handleGithubOpenPR,
  handleGithubComment,
  handleGithubAddLabels,
  handleGithubSetProjectStatus,
  handleGithubReadyForReview,
  __setGithubService,
  __resetGithubService
} from '../src/mcp/tools/handlers/githubHandlers.js';
import { handleTaskCreate } from '../src/mcp/tools/handlers/taskCreateHandler.js';
import { repo, eventRepo } from '../src/mcp/tools/handlers/sharedRepos.js';
import type { GithubService } from '../src/github/service.js';

function resetDatabase() {
  repo.database.exec(`
    DELETE FROM github_requests;
    DELETE FROM event_log;
    DELETE FROM leases;
    DELETE FROM orchestrator_state;
    DELETE FROM task_records;
  `);
}

describe('githubHandlers', () => {
  beforeEach(() => {
    resetDatabase();
  });

  afterEach(() => {
    __resetGithubService();
    resetDatabase();
    vi.restoreAllMocks();
  });

  it('handles branch creation and logs event when taskId present', async () => {
    const task = await handleTaskCreate({
      title: 'Branch handler task',
      acceptance_criteria: ['AC'],
      scope: 'minor'
    });

    const mockService: GithubService = {
      createBranch: vi.fn().mockResolvedValue({ url: 'url', commit: 'sha', created: true }),
      openPullRequest: vi.fn(),
      comment: vi.fn(),
      addLabels: vi.fn(),
      setProjectStatus: vi.fn(),
      markReadyForReview: vi.fn()
    } as unknown as GithubService;

    __setGithubService(mockService);

    const result = await handleGithubCreateBranch({
      owner: 'octo',
      repo: 'repo',
      base: 'main',
      name: 'feature/test',
      protect: true,
      requestId: 'req-123456',
      taskId: task.id
    });

    expect(mockService.createBranch).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'repo',
      base: 'main',
      name: 'feature/test',
      protect: true,
      requestId: 'req-123456'
    });
    expect(result).toEqual({ url: 'url', commit: 'sha', created: true });

    const events = eventRepo.getByTaskId(task.id, 10);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('github');
    expect(events[0].payload.tool).toBe('gh.createBranch');
  });

  it('handles PR open and comment/labels/project/ready tools with service delegation', async () => {
    const task = await handleTaskCreate({
      title: 'PR handler task',
      acceptance_criteria: ['AC'],
      scope: 'major'
    });

    const mockService = {
      createBranch: vi.fn(),
      openPullRequest: vi.fn().mockResolvedValue({ number: 42, url: 'pr-url', draft: true }),
      comment: vi.fn().mockResolvedValue({ id: 1, url: 'comment-url' }),
      addLabels: vi.fn().mockResolvedValue({ applied: ['fast-track'] }),
      setProjectStatus: vi.fn().mockResolvedValue({ ok: true, itemId: 'item' }),
      markReadyForReview: vi.fn().mockResolvedValue({ draft: false, updated: true })
    } as unknown as GithubService;

    __setGithubService(mockService);

    const prResult = await handleGithubOpenPR({
      owner: 'octo',
      repo: 'repo',
      title: 'PR Title',
      head: 'feature',
      base: 'main',
      body: 'Body',
      draft: true,
      labels: ['label'],
      assignees: ['octo'],
      requestId: 'req-open-1',
      taskId: task.id
    });

    expect(prResult.number).toBe(42);
    expect(mockService.openPullRequest).toHaveBeenCalled();

    await handleGithubComment({
      owner: 'octo',
      repo: 'repo',
      issueNumber: 42,
      body: 'Nice work',
      requestId: 'req-comment-1',
      taskId: task.id
    });
    await handleGithubAddLabels({
      owner: 'octo',
      repo: 'repo',
      issueNumber: 42,
      labels: ['fast-track'],
      requestId: 'req-label-1',
      taskId: task.id
    });
    await handleGithubSetProjectStatus({
      owner: 'octo',
      repo: 'repo',
      issueNumber: 42,
      project: { id: 'proj', field: 'Status', value: 'In Progress' },
      requestId: 'req-project-1',
      taskId: task.id
    });
    await handleGithubReadyForReview({
      owner: 'octo',
      repo: 'repo',
      pullNumber: 42,
      requestId: 'req-ready-1',
      taskId: task.id
    });

    expect(mockService.comment).toHaveBeenCalled();
    expect(mockService.addLabels).toHaveBeenCalled();
    expect(mockService.setProjectStatus).toHaveBeenCalled();
    expect(mockService.markReadyForReview).toHaveBeenCalled();

    const events = eventRepo.getByTaskId(task.id, 20);
    expect(events.filter(e => e.type === 'github')).toHaveLength(5);
  });
});
