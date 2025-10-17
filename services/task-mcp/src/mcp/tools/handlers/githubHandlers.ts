import {
  createGithubService,
  type GithubService,
  type CreateBranchParams,
  type OpenPullRequestParams,
  type CommentParams,
  type AddLabelsParams,
  type SetProjectStatusParams,
  type ReadyForReviewParams
} from '../../../github/service.js';
import { eventRepo, githubRequestRepo } from './sharedRepos.js';

let githubService: GithubService | null = null;

function getGithubService(): GithubService {
  if (!githubService) {
    githubService = createGithubService({ requests: githubRequestRepo });
  }
  return githubService;
}

export function __setGithubService(service: GithubService) {
  githubService = service;
}

export function __resetGithubService() {
  githubService = null;
}

type WithTaskId<T> = T & { taskId?: string };

type GithubEventPayload = {
  tool: string;
  requestId: string;
  input: Record<string, unknown>;
  result: unknown;
};

function appendGithubEvent(taskId: string | undefined, payload: GithubEventPayload) {
  if (!taskId) {
    return;
  }
  eventRepo.append(taskId, 'github', payload);
}

export async function handleGithubCreateBranch(input: unknown) {
  const { taskId, ...raw } = input as WithTaskId<CreateBranchParams>;
  const service = getGithubService();
  const result = await service.createBranch(raw as CreateBranchParams);
  appendGithubEvent(taskId, {
    tool: 'gh.createBranch',
    requestId: raw.requestId,
    input: { owner: raw.owner, repo: raw.repo, base: raw.base, name: raw.name, protect: raw.protect },
    result
  });
  return result;
}

export async function handleGithubOpenPR(input: unknown) {
  const { taskId, ...raw } = input as WithTaskId<OpenPullRequestParams>;
  const service = getGithubService();
  const result = await service.openPullRequest(raw as OpenPullRequestParams);
  appendGithubEvent(taskId, {
    tool: 'gh.openPR',
    requestId: raw.requestId,
    input: {
      owner: raw.owner,
      repo: raw.repo,
      head: raw.head,
      base: raw.base,
      draft: raw.draft,
      labels: raw.labels,
      assignees: raw.assignees
    },
    result
  });
  return result;
}

export async function handleGithubComment(input: unknown) {
  const { taskId, ...raw } = input as WithTaskId<CommentParams>;
  const service = getGithubService();
  const result = await service.comment(raw as CommentParams);
  appendGithubEvent(taskId, {
    tool: 'gh.comment',
    requestId: raw.requestId,
    input: { owner: raw.owner, repo: raw.repo, issueNumber: raw.issueNumber },
    result
  });
  return result;
}

export async function handleGithubAddLabels(input: unknown) {
  const { taskId, ...raw } = input as WithTaskId<AddLabelsParams>;
  const service = getGithubService();
  const result = await service.addLabels(raw as AddLabelsParams);
  appendGithubEvent(taskId, {
    tool: 'gh.addLabels',
    requestId: raw.requestId,
    input: { owner: raw.owner, repo: raw.repo, issueNumber: raw.issueNumber, labels: raw.labels },
    result
  });
  return result;
}

export async function handleGithubSetProjectStatus(input: unknown) {
  const { taskId, ...raw } = input as WithTaskId<SetProjectStatusParams>;
  const service = getGithubService();
  const result = await service.setProjectStatus(raw as SetProjectStatusParams);
  appendGithubEvent(taskId, {
    tool: 'gh.setProjectStatus',
    requestId: raw.requestId,
    input: {
      owner: raw.owner,
      repo: raw.repo,
      issueNumber: raw.issueNumber,
      project: raw.project
    },
    result
  });
  return result;
}

export async function handleGithubReadyForReview(input: unknown) {
  const { taskId, ...raw } = input as WithTaskId<ReadyForReviewParams>;
  const service = getGithubService();
  const result = await service.markReadyForReview(raw as ReadyForReviewParams);
  appendGithubEvent(taskId, {
    tool: 'gh.readyForReview',
    requestId: raw.requestId,
    input: { owner: raw.owner, repo: raw.repo, pullNumber: raw.pullNumber },
    result
  });
  return result;
}
