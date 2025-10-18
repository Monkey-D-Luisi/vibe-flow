import { describe, expect, it, vi } from "vitest";
import { PrBotAgent, validatePrSummary } from "../src/agents/prbot.js";
import type { GithubService } from "../src/github/service.js";
import type { GithubPrBotConfig } from "../src/github/config.js";
import type { TaskRecord } from "../src/domain/TaskRecord.js";
import { fingerprint } from "../src/utils/normalize.js";

const baseConfig: GithubPrBotConfig = {
  defaultBase: "main",
  project: { id: "PVT_test", statusField: "Status" },
  labels: {
    fastTrack: "fast-track",
    fastTrackEligible: "fast-track:eligible",
    fastTrackIncompatible: "fast-track:incompatible",
    fastTrackRevoked: "fast-track:revoked",
    qualityFailed: "quality_gate_failed",
    inReview: "in-review",
    readyForQa: "ready-for-qa",
    areaGithub: "area_github",
    agentPrBot: "agent_pr-bot",
    task: "task"
  },
  assignees: ["monkey-d-luisi"],
  reviewers: ["team/devs"],
  gateCheckName: "quality-gate"
};

const baseTask: TaskRecord = {
  id: "TR-TEST12345678901234567890",
  title: "Implement login flow",
  description: "Implement the login flow with MFA support",
  acceptance_criteria: ["Users can login with email/password", "Users receive MFA challenge"],
  scope: "minor",
  status: "pr",
  rev: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  tags: ["fast-track", "fast-track:eligible"],
  metrics: {
    coverage: 0.82,
    lint: { errors: 0, warnings: 1 }
  },
  qa_report: { total: 12, passed: 12, failed: 0 },
  red_green_refactor_log: ["red: failing test", "green: implementation", "refactor: cleanup"],
  links: {
    github: { owner: "acme", repo: "project", issueNumber: 7 }
  }
};

function cloneTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    ...baseTask,
    ...overrides,
    acceptance_criteria: overrides.acceptance_criteria ?? [...baseTask.acceptance_criteria],
    tags: overrides.tags ?? [...(baseTask.tags ?? [])],
    metrics: overrides.metrics ? { ...overrides.metrics } : { ...(baseTask.metrics ?? {}) },
    qa_report: overrides.qa_report
      ? { ...overrides.qa_report }
      : baseTask.qa_report
        ? { ...baseTask.qa_report }
        : undefined,
    red_green_refactor_log: overrides.red_green_refactor_log
      ? [...overrides.red_green_refactor_log]
      : [...(baseTask.red_green_refactor_log ?? [])],
    links: {
      ...(baseTask.links ?? {}),
      ...(overrides.links ?? {}),
      github: overrides.links?.github
        ? { ...(baseTask.links?.github ?? {}), ...overrides.links.github }
        : baseTask.links?.github
    }
  };
}

function buildAgent(override: Partial<GithubPrBotConfig> = {}) {
  const mergedConfig: GithubPrBotConfig = {
    ...baseConfig,
    ...override,
    project: override.project ? { ...baseConfig.project, ...override.project } : baseConfig.project,
    labels: override.labels ? { ...baseConfig.labels, ...override.labels } : baseConfig.labels,
    assignees: override.assignees ?? [...(baseConfig.assignees ?? [])],
    reviewers: override.reviewers ?? [...(baseConfig.reviewers ?? [])]
  };

  const createBranch = vi.fn(async () => ({ url: "branch-url", commit: "sha", created: true }));
  const openPullRequest = vi.fn(async () => ({ number: 123, url: "https://github.com/acme/project/pull/123", draft: true }));
  const addLabels = vi.fn(async () => ({ applied: [] }));
  const removeLabel = vi.fn(async () => ({ removed: true }));
  const requestReviewers = vi.fn(async () => ({ requested: [] }));
  const setProjectStatus = vi.fn(async () => ({ ok: true }));
  const markReadyForReview = vi.fn(async () => ({ draft: false, updated: true }));
  const comment = vi.fn(async () => ({ id: 99, url: "https://example.com/comment" }));

  const github = {
    createBranch,
    openPullRequest,
    addLabels,
    removeLabel,
    requestReviewers,
    setProjectStatus,
    markReadyForReview,
    comment
  } as unknown as GithubService;

  return {
    agent: new PrBotAgent(github, mergedConfig),
    spies: {
      createBranch,
      openPullRequest,
      addLabels,
      removeLabel,
      requestReviewers,
      setProjectStatus,
      markReadyForReview,
      comment
    }
  };
}

describe("PrBotAgent", () => {
  it("sincroniza la PR y genera requestId con fingerprints", async () => {
    const { agent, spies } = buildAgent();
    const task = cloneTask();

    const summary = await agent.run(task);

    expect(summary.branch).toMatch(/^feature\/tr-test/);
    expect(summary.pr_url).toBe("https://github.com/acme/project/pull/123");
    expect(summary.checklist.length).toBeGreaterThan(0);
    expect(() => validatePrSummary(summary)).not.toThrow();

    expect(spies.createBranch).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "acme", repo: "project", base: "main", name: summary.branch })
    );

    expect(spies.openPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "project",
        head: summary.branch,
        base: "main",
        draft: true,
        assignees: ["monkey-d-luisi"],
        labels: expect.arrayContaining(["fast-track", "fast-track:eligible", "area_github"])
      })
    );

    const addLabelCall = spies.addLabels.mock.calls[0][0];
    const labelFingerprint = fingerprint(addLabelCall.labels);
    expect(addLabelCall.requestId).toBe(`prbot:${task.id}:labels:123:${labelFingerprint}`);

    const reviewersCall = spies.requestReviewers.mock.calls[0][0];
    const reviewersFingerprint = fingerprint({ reviewers: reviewersCall.reviewers, teamReviewers: reviewersCall.teamReviewers });
    expect(reviewersCall.requestId).toBe(`prbot:${task.id}:reviewers:123:${reviewersFingerprint}`);

    const statusCall = spies.setProjectStatus.mock.calls[0][0];
    const statusFingerprint = fingerprint(statusCall.project);
    expect(statusCall.requestId).toBe(
      `prbot:${task.id}:project-status:${statusCall.issueNumber}:${statusFingerprint}`
    );

    const removeLabelCalls = spies.removeLabel.mock.calls.map((call) => call[0]);
    for (const removeCall of removeLabelCalls) {
      const removeFingerprint = fingerprint(removeCall.label);
      expect(removeCall.requestId).toBe(
        `prbot:${task.id}:remove-label:${removeCall.issueNumber}:${removeFingerprint}`
      );
    }

    const commentCall = spies.comment.mock.calls[0][0];
    const commentFingerprint = fingerprint(commentCall.body);
    expect(commentCall.requestId).toBe(`prbot:${task.id}:quality-comment:123:${commentFingerprint}`);
  });

  it("no marca ready-for-review si el gate falla", async () => {
    const { agent, spies } = buildAgent();
    await agent.run(cloneTask({ tags: ["quality_gate_failed"], status: "review" }));
    expect(spies.markReadyForReview).not.toHaveBeenCalled();
  });

  it("mantiene el requestId de etiquetas cuando solo cambia el orden", async () => {
    const { agent: agentA, spies: spiesA } = buildAgent();
    await agentA.run(cloneTask());
    const initialId = spiesA.addLabels.mock.calls[0][0].requestId;

    const { agent: agentB, spies: spiesB } = buildAgent();
    await agentB.run(cloneTask({ tags: ["fast-track:eligible", "fast-track"] }));
    const sameOrderId = spiesB.addLabels.mock.calls[0][0].requestId;
    expect(sameOrderId).toBe(initialId);

    const { agent: agentC, spies: spiesC } = buildAgent();
    await agentC.run(cloneTask({ tags: ["fast-track", "fast-track:eligible", "quality_gate_failed"] }));
    const differentId = spiesC.addLabels.mock.calls[0][0].requestId;
    expect(differentId).not.toBe(initialId);
  });

  it("genera el mismo requestId de reviewers aunque cambie el orden", async () => {
    const { agent: agentA, spies: spiesA } = buildAgent({ reviewers: ["alice", "team/devs"] });
    await agentA.run(cloneTask());
    const firstId = spiesA.requestReviewers.mock.calls[0][0].requestId;

    const { agent: agentB, spies: spiesB } = buildAgent({ reviewers: ["team/devs", "alice"] });
    await agentB.run(cloneTask());
    const secondId = spiesB.requestReviewers.mock.calls[0][0].requestId;

    expect(secondId).toBe(firstId);
  });

  it("cambia el requestId del project cuando el estado es distinto", async () => {
    const { agent: agentA, spies: spiesA } = buildAgent();
    await agentA.run(cloneTask({ status: "pr" }));
    const inReviewId = spiesA.setProjectStatus.mock.calls[0][0].requestId;

    const { agent: agentB, spies: spiesB } = buildAgent();
    await agentB.run(cloneTask({ status: "dev" }));
    const inProgressId = spiesB.setProjectStatus.mock.calls[0][0].requestId;

    expect(inProgressId).not.toBe(inReviewId);
  });
});
