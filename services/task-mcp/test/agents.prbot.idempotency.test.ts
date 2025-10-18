import { describe, expect, it } from "vitest";
import { PrBotAgent } from "../src/agents/prbot.js";
import { loadGithubPrBotConfig } from "../src/github/config.js";
import type {
  GithubService,
  CreateBranchParams,
  OpenPullRequestParams,
  AddLabelsParams,
  RemoveLabelParams,
  RequestReviewersParams,
  CommentParams,
  SetProjectStatusParams,
  ReadyForReviewParams,
  BranchResult,
  PullRequestResult,
  LabelsResult,
  RemoveLabelResult,
  ReviewersResult,
  CommentResult,
  ProjectStatusResult,
  ReadyForReviewResult
} from "../src/github/service.js";
import { TaskRepository } from "../src/repo/repository.js";
import { GithubRequestRepository } from "../src/repo/githubRequests.js";
import type { TaskRecord } from "../src/domain/TaskRecord.js";

function makeTask(): TaskRecord {
  const now = new Date().toISOString();
  return {
    id: "TR-IDEMPOTENCY123456789012345",
    title: "Idempotency verification",
    description: "Ensure GitHub cache prevents duplicate calls",
    acceptance_criteria: ["Open PR", "Sync labels"],
    scope: "minor",
    status: "pr",
    rev: 0,
    created_at: now,
    updated_at: now,
    tags: ["fast-track", "fast-track:eligible"],
    metrics: { coverage: 0.85, lint: { errors: 0, warnings: 0 } },
    qa_report: { total: 5, passed: 5, failed: 0 },
    red_green_refactor_log: ["RED", "GREEN", "REFACTOR"],
    links: {
      github: { owner: "acme", repo: "project", issueNumber: 77 }
    }
  };
}

type Counters = Record<
  "createBranch" | "openPullRequest" | "addLabels" | "removeLabel" | "requestReviewers" | "comment" | "setProjectStatus" | "markReadyForReview",
  number
>;

function makeGithubService(requests: GithubRequestRepository, counters: Counters): GithubService {
  const ensure = <T>(requestId: string, tool: string, params: unknown, responder: () => Promise<T>) =>
    requests.ensure(requestId, tool, params, responder);

  return {
    async createBranch(params: CreateBranchParams): Promise<BranchResult> {
      return ensure(params.requestId, "gh.createBranch", params, async () => {
        counters.createBranch += 1;
        return { url: "branch-url", commit: "sha", created: counters.createBranch === 1 };
      });
    },
    async openPullRequest(params: OpenPullRequestParams): Promise<PullRequestResult> {
      return ensure(params.requestId, "gh.openPR", params, async () => {
        counters.openPullRequest += 1;
        return { number: 123, url: "https://example.com/pull/123", draft: params.draft };
      });
    },
    async addLabels(params: AddLabelsParams): Promise<LabelsResult> {
      return ensure(params.requestId, "gh.addLabels", params, async () => {
        counters.addLabels += 1;
        return { applied: params.labels ?? [] };
      });
    },
    async removeLabel(params: RemoveLabelParams): Promise<RemoveLabelResult> {
      return ensure(params.requestId, "gh.removeLabel", params, async () => {
        counters.removeLabel += 1;
        return { removed: true };
      });
    },
    async requestReviewers(params: RequestReviewersParams): Promise<ReviewersResult> {
      return ensure(params.requestId, "gh.requestReviewers", params, async () => {
        counters.requestReviewers += 1;
        return { requested: [...(params.reviewers ?? []), ...(params.teamReviewers ?? [])] };
      });
    },
    async comment(params: CommentParams): Promise<CommentResult> {
      return ensure(params.requestId, "gh.comment", params, async () => {
        counters.comment += 1;
        return { id: counters.comment, url: `https://example.com/comment/${counters.comment}` };
      });
    },
    async setProjectStatus(params: SetProjectStatusParams): Promise<ProjectStatusResult> {
      return ensure(params.requestId, "gh.setProjectStatus", params, async () => {
        counters.setProjectStatus += 1;
        return { ok: true };
      });
    },
    async markReadyForReview(params: ReadyForReviewParams): Promise<ReadyForReviewResult> {
      return ensure(params.requestId, "gh.readyForReview", params, async () => {
        counters.markReadyForReview += 1;
        return { draft: false, updated: true };
      });
    }
  };
}

describe("PrBotAgent idempotency with request repository", () => {
  it("reuses cached responses for repeated payloads", async () => {
    const repo = new TaskRepository();
    const requests = new GithubRequestRepository(repo.database);
    const counters: Counters = {
      createBranch: 0,
      openPullRequest: 0,
      addLabels: 0,
      removeLabel: 0,
      requestReviewers: 0,
      comment: 0,
      setProjectStatus: 0,
      markReadyForReview: 0
    };

    const service = makeGithubService(requests, counters);
    const config = loadGithubPrBotConfig();
    const agent = new PrBotAgent(service, config);

    const task = makeTask();
    await agent.run(task);

    expect(counters).toMatchObject({
      createBranch: 1,
      openPullRequest: 1,
      addLabels: 1,
      removeLabel: expect.any(Number),
      requestReviewers: 1,
      comment: 1,
      setProjectStatus: 1,
      markReadyForReview: 1
    });
    const removeLabelCalls = counters.removeLabel;

    await agent.run({ ...task, updated_at: new Date().toISOString() });

    expect(counters.createBranch).toBe(1);
    expect(counters.openPullRequest).toBe(1);
    expect(counters.addLabels).toBe(1);
    expect(counters.removeLabel).toBe(removeLabelCalls);
    expect(counters.setProjectStatus).toBe(1);
    expect(counters.comment).toBe(1);
    expect(counters.markReadyForReview).toBe(1);
  });
});
