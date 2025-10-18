import { GithubRequestRepository } from '../repo/githubRequests.js';
import { GithubPrBotConfig, loadGithubPrBotConfig } from './config.js';
import { GithubOctokit, createOctokit } from './octokit.js';

const BRANCH_REF_PREFIX = 'refs/heads/';
const TOOL_CREATE_BRANCH = 'gh.createBranch';
const TOOL_OPEN_PR = 'gh.openPR';
const TOOL_COMMENT = 'gh.comment';
const TOOL_ADD_LABELS = 'gh.addLabels';
const TOOL_SET_PROJECT_STATUS = 'gh.setProjectStatus';
const TOOL_READY_FOR_REVIEW = 'gh.readyForReview';
const TOOL_REMOVE_LABEL = 'gh.removeLabel';
const TOOL_REQUEST_REVIEWERS = 'gh.requestReviewers';

interface BaseParams {
  owner: string;
  repo: string;
  requestId: string;
}

export interface CreateBranchParams extends BaseParams {
  base: string;
  name: string;
  protect?: boolean;
}

export interface OpenPullRequestParams extends BaseParams {
  title: string;
  head: string;
  base: string;
  body: string;
  draft: boolean;
  labels?: string[];
  assignees?: string[];
  linkTaskId?: string;
}

export interface CommentParams extends BaseParams {
  issueNumber: number;
  body: string;
}

export interface AddLabelsParams extends BaseParams {
  issueNumber: number;
  labels: string[];
}

export interface RemoveLabelParams extends BaseParams {
  issueNumber: number;
  label: string;
}

export interface SetProjectStatusParams extends BaseParams {
  issueNumber: number;
  project: {
    id: string;
    field: string;
    value: string;
  };
}

export interface ReadyForReviewParams extends BaseParams {
  pullNumber: number;
}

export interface RequestReviewersParams extends BaseParams {
  pullNumber: number;
  reviewers?: string[];
  teamReviewers?: string[];
}

export interface BranchResult {
  url: string;
  commit: string;
  created: boolean;
}

export interface PullRequestResult {
  number: number;
  url: string;
  draft: boolean;
}

export interface CommentResult {
  id: number;
  url: string;
}

export interface LabelsResult {
  applied: string[];
}

export interface RemoveLabelResult {
  removed: boolean;
}

export interface ProjectStatusResult {
  ok: boolean;
  itemId?: string;
}

export interface ReadyForReviewResult {
  draft: boolean;
  updated: boolean;
}

export interface ReviewersResult {
  requested: string[];
}

interface SingleSelectFieldCache {
  fieldId: string;
  options: Record<string, string>;
}

interface RequestErrorLike {
  status: number;
  message?: string;
}

function isRequestError(error: unknown): error is RequestErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as RequestErrorLike).status === 'number'
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message;
  }
  if (isRequestError(error) && typeof error.message === 'string') {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return 'Unknown error';
}

function unique(values: string[] = []): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function branchUrl(owner: string, repo: string, branch: string): string {
  return `https://github.com/${owner}/${repo}/tree/${branch}`;
}

function prUrl(owner: string, repo: string, number: number): string {
  return `https://github.com/${owner}/${repo}/pull/${number}`;
}

export class GithubService {
  private readonly cache = new Map<string, SingleSelectFieldCache>();

  constructor(
    private readonly octokit: GithubOctokit,
    private readonly requests: GithubRequestRepository,
    private readonly config: GithubPrBotConfig
  ) {}

  async createBranch(params: CreateBranchParams): Promise<BranchResult> {
    const { owner, repo, name, base, protect } = params;
    return this.requests.ensure(params.requestId, TOOL_CREATE_BRANCH, params, async () => {
      const existingSha = await this.tryGetRef(owner, repo, name);
      if (existingSha) {
        return { url: branchUrl(owner, repo, name), commit: existingSha, created: false };
      }

      const baseRef = await this.octokit.rest.git.getRef({ owner, repo, ref: `heads/${base}` });
      const baseSha = baseRef.data.object.sha;
      const created = await this.octokit.rest.git.createRef({ owner, repo, ref: `${BRANCH_REF_PREFIX}${name}`, sha: baseSha });
      const commitSha = created.data.object.sha;

      if (protect) {
        await this.applyBranchProtection(owner, repo, name);
      }

      return { url: branchUrl(owner, repo, name), commit: commitSha, created: true };
    });
  }

  async openPullRequest(params: OpenPullRequestParams): Promise<PullRequestResult> {
    const { owner, repo, head, base, title, body, draft, labels, assignees } = params;
    return this.requests.ensure(params.requestId, TOOL_OPEN_PR, params, async () => {
      const existing = await this.findExistingPull(owner, repo, head, base);
      if (existing) {
        return { number: existing.number, url: existing.html_url, draft: Boolean(existing.draft) };
      }

      const created = await this.octokit.rest.pulls.create({ owner, repo, head, base, title, body, draft });
      const pr = created.data;

      if (labels && labels.length > 0) {
        await this.octokit.rest.issues.addLabels({ owner, repo, issue_number: pr.number, labels: unique(labels) });
      }
      if (assignees && assignees.length > 0) {
        await this.octokit.rest.issues.addAssignees({ owner, repo, issue_number: pr.number, assignees: unique(assignees) });
      }

      return { number: pr.number, url: pr.html_url ?? prUrl(owner, repo, pr.number), draft: Boolean(pr.draft ?? draft) };
    });
  }

  async comment(params: CommentParams): Promise<CommentResult> {
    const { owner, repo, issueNumber, body } = params;
    return this.requests.ensure(params.requestId, TOOL_COMMENT, params, async () => {
      const response = await this.octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
      return { id: response.data.id, url: response.data.html_url };
    });
  }

  async addLabels(params: AddLabelsParams): Promise<LabelsResult> {
    const { owner, repo, issueNumber, labels } = params;
    return this.requests.ensure(params.requestId, TOOL_ADD_LABELS, params, async () => {
      if (!labels || labels.length === 0) {
        return { applied: [] };
      }
      const response = await this.octokit.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: unique(labels) });
      return { applied: response.data.map(label => label.name).filter(Boolean) };
    });
  }

  async removeLabel(params: RemoveLabelParams): Promise<RemoveLabelResult> {
    const { owner, repo, issueNumber, label } = params;
    return this.requests.ensure(params.requestId, TOOL_REMOVE_LABEL, params, async () => {
      try {
        await this.octokit.rest.issues.removeLabel({ owner, repo, issue_number: issueNumber, name: label });
        return { removed: true };
      } catch (error) {
        if (isRequestError(error) && error.status === 404) {
          return { removed: false };
        }
        throw error;
      }
    });
  }

  async setProjectStatus(params: SetProjectStatusParams): Promise<ProjectStatusResult> {
    const { owner, repo, issueNumber, project } = params;
    return this.requests.ensure(params.requestId, TOOL_SET_PROJECT_STATUS, params, async () => {
      const issue = await this.octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
      const contentId = issue.data.node_id;
      if (!contentId) {
        throw new Error('GitHub issue missing node_id');
      }

      const itemId = await this.ensureProjectItem(project.id, contentId);
      const field = await this.loadSingleSelectField(project.id, project.field);
      const optionId = field.options[project.value];
      if (!optionId) {
        throw new Error(`Project option ${project.value} not found for field ${project.field}`);
      }

      await this.octokit.graphql(
        `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
           updateProjectV2ItemFieldValue(input: {
             projectId: $projectId,
             itemId: $itemId,
             fieldId: $fieldId,
             value: { singleSelectOptionId: $optionId }
           }) {
             projectV2Item { id }
           }
         }`,
        {
          projectId: project.id,
          itemId,
          fieldId: field.fieldId,
          optionId
        }
      );

      return { ok: true, itemId };
    });
  }

  async markReadyForReview(params: ReadyForReviewParams): Promise<ReadyForReviewResult> {
    const { owner, repo, pullNumber } = params;
    return this.requests.ensure(params.requestId, TOOL_READY_FOR_REVIEW, params, async () => {
      const pr = await this.octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber });
      if (!pr.data.draft) {
        return { draft: false, updated: false };
      }

      await this.octokit.graphql(
        `mutation($pullRequestId: ID!) {
           markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
             pullRequest { id }
           }
         }`,
        { pullRequestId: pr.data.node_id }
      );

      return { draft: false, updated: true };
    });
  }

  async requestReviewers(params: RequestReviewersParams): Promise<ReviewersResult> {
    const { owner, repo, pullNumber } = params;
    const reviewers = unique(params.reviewers ?? []);
    const teamReviewers = unique(params.teamReviewers ?? []);
    if (reviewers.length === 0 && teamReviewers.length === 0) {
      return { requested: [] };
    }

    return this.requests.ensure(params.requestId, TOOL_REQUEST_REVIEWERS, params, async () => {
      await this.octokit.rest.pulls.requestReviewers({
        owner,
        repo,
        pull_number: pullNumber,
        reviewers: reviewers.length > 0 ? reviewers : undefined,
        team_reviewers: teamReviewers.length > 0 ? teamReviewers : undefined
      });
      return { requested: [...reviewers, ...teamReviewers] };
    });
  }

  private async tryGetRef(owner: string, repo: string, branch: string): Promise<string | null> {
    try {
      const ref = await this.octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
      return ref.data.object.sha;
    } catch (error) {
      if (isRequestError(error) && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private async applyBranchProtection(owner: string, repo: string, branch: string): Promise<void> {
    try {
      await this.octokit.rest.repos.updateBranchProtection({
        owner,
        repo,
        branch,
        required_status_checks: {
          strict: true,
          contexts: unique([this.config.gateCheckName])
        },
        enforce_admins: null,
        required_pull_request_reviews: {
          required_approving_review_count: 1
        },
        restrictions: null
      });
    } catch (error) {
      console.warn(`Failed to apply branch protection on ${branch}: ${getErrorMessage(error)}`);
    }
  }

  private async findExistingPull(owner: string, repo: string, head: string, base: string) {
    const headWithOwner = head.includes(':') ? head : `${owner}:${head}`;
    const response = await this.octokit.rest.pulls.list({ owner, repo, head: headWithOwner, base, state: 'all', per_page: 1 });
    return response.data[0];
  }

  private async ensureProjectItem(projectId: string, contentId: string): Promise<string> {
    const lookup = await this.octokit.graphql<{ node?: { items?: { nodes: Array<{ id: string } | null> } } }>(
      `query($projectId: ID!, $contentId: ID!) {
         node(id: $projectId) {
           ... on ProjectV2 {
             items(first: 20, filterBy: { contentId: $contentId }) {
               nodes { id }
             }
           }
         }
       }`,
      { projectId, contentId }
    );

    const existing = lookup.node?.items?.nodes?.find(node => node !== null);
    if (existing?.id) {
      return existing.id;
    }

    const created = await this.octokit.graphql<{ addProjectV2ItemById: { item: { id: string } | null } }>(
      `mutation($projectId: ID!, $contentId: ID!) {
         addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
           item { id }
         }
       }`,
      { projectId, contentId }
    );

    const itemId = created.addProjectV2ItemById?.item?.id;
    if (!itemId) {
      throw new Error('Failed to create project item');
    }
    return itemId;
  }

  private async loadSingleSelectField(projectId: string, fieldName: string): Promise<SingleSelectFieldCache> {
    const cacheKey = `${projectId}:${fieldName}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.octokit.graphql<{ node?: { fields?: { nodes: Array<{ id: string; name: string; options?: Array<{ id: string; name: string } | null> } | null> } } }>(
      `query($projectId: ID!) {
         node(id: $projectId) {
           ... on ProjectV2 {
             fields(first: 50) {
               nodes {
                 ... on ProjectV2SingleSelectField {
                   id
                   name
                   options {
                     id
                     name
                   }
                 }
               }
             }
           }
         }
       }`,
      { projectId }
    );

    const field = result.node?.fields?.nodes
      ?.filter((node): node is { id: string; name: string; options?: Array<{ id: string; name: string } | null> } => Boolean(node && node.name === fieldName))
      ?.at(0);

    if (!field) {
      throw new Error(`Project field ${fieldName} not found`);
    }

    const options = Object.fromEntries(
      (field.options ?? [])
        .filter((opt): opt is { id: string; name: string } => Boolean(opt))
        .map(opt => [opt.name, opt.id])
    );

    const cacheEntry = { fieldId: field.id, options };
    this.cache.set(cacheKey, cacheEntry);
    return cacheEntry;
  }
}

export interface GithubServiceOptions {
  octokit?: GithubOctokit;
  requests: GithubRequestRepository;
  config?: GithubPrBotConfig;
}

export function createGithubService(options: GithubServiceOptions): GithubService {
  const octokit = options.octokit ?? createOctokit();
  const config = options.config ?? loadGithubPrBotConfig();
  return new GithubService(octokit, options.requests, config);
}
