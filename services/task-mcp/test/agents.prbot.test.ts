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
  gateCheckName: "quality-gate",
  ready: {
    requireQaPass: true,
    requireReviewApproval: true,
    minApprovals: 1
  },
  checks: {
    qaWorkflowNames: ["green-tests", "quality-gate"]
  }
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
    github: { owner: "acme", repo: "project", issueNumber: 7 },
    adr: ["ADR-001", "ADR-004"]
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
    links: (() => {
      const merged = {
        ...(baseTask.links ?? {}),
        ...(overrides.links ?? {})
      };
      const baseGithub = baseTask.links?.github ?? {};
      const overrideGithub = overrides.links?.github ?? {};
      if (baseTask.links?.github || overrides.links?.github) {
        merged.github = { ...baseGithub, ...overrideGithub };
      }
      if (Array.isArray(merged.adr)) {
        merged.adr = [...merged.adr];
      }
      return merged;
    })()
  };
}

function buildAgent(override: Partial<GithubPrBotConfig> = {}) {
  const mergedConfig: GithubPrBotConfig = {
    ...baseConfig,
    ...override,
    project: override.project ? { ...baseConfig.project, ...override.project } : baseConfig.project,
    labels: override.labels ? { ...baseConfig.labels, ...override.labels } : baseConfig.labels,
    assignees: override.assignees ?? [...(baseConfig.assignees ?? [])],
    reviewers: override.reviewers ?? [...(baseConfig.reviewers ?? [])],
    ready: override.ready ? { ...baseConfig.ready, ...override.ready } : baseConfig.ready,
    checks: override.checks ? { ...baseConfig.checks, ...override.checks } : baseConfig.checks
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
    expect(summary.checklist).toEqual([
      "[x] ACs registrados (2)",
      "[x] ADR referenciados (ADR-001, ADR-004)",
      "[x] RGR log (entradas: 3)",
      "[x] Coverage >= 70% (actual: 82%)",
      "[x] Lint 0 errores (actual: 0)",
      "[x] QA sin fallos (12/12)"
    ]);
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

    const prCall = spies.openPullRequest.mock.calls[0][0];
    expect(prCall.body).toContain("### Checklist");
    expect(prCall.body).toContain("- [x] ACs registrados (2)");
    expect(prCall.body).toContain("- [x] ADR referenciados (ADR-001, ADR-004)");
    expect(prCall.body).toContain("### ACs");
    expect(prCall.body).toContain("- Users can login with email/password");
    expect(prCall.body).toContain("### Calidad (resumen)");
    expect(prCall.body).toContain("Closes #7");
  });

  it("no marca ready-for-review si el gate falla", async () => {
    const { agent, spies } = buildAgent();
    await agent.run(cloneTask({ tags: ["quality_gate_failed"], status: "review" }), { approvalsCount: 1 });
    expect(spies.markReadyForReview).not.toHaveBeenCalled();
  });

  it("no marca ready-for-review si faltan aprobaciones", async () => {
    const { agent, spies } = buildAgent();
    await agent.run(cloneTask(), { approvalsCount: 0 });
    expect(spies.markReadyForReview).not.toHaveBeenCalled();
  });

  it("no marca ready-for-review si el reporte de QA tiene fallos", async () => {
    const { agent, spies } = buildAgent();
    const task = cloneTask({ qa_report: { total: 5, passed: 4, failed: 1 } });
    await agent.run(task, { approvalsCount: 1 });
    expect(spies.markReadyForReview).not.toHaveBeenCalled();
  });

  it("marca ready-for-review cuando los checks de QA suplen el reporte", async () => {
    const { agent, spies } = buildAgent();
    const task = cloneTask();
    delete (task as any).qa_report;
    await agent.run(task, { approvalsCount: 1, qaChecksPassed: true });
    expect(spies.markReadyForReview).toHaveBeenCalled();
  });

  it("promueve aunque el estado persistido sea done", async () => {
    const { agent, spies } = buildAgent();
    await agent.run(cloneTask({ status: "done" }), { approvalsCount: 1 });
    expect(spies.markReadyForReview).toHaveBeenCalled();
  });

  it("mantiene el requestId de etiquetas cuando solo cambia el orden", async () => {
    const { agent: agentA, spies: spiesA } = buildAgent();
    await agentA.run(cloneTask(), { approvalsCount: 1 });
    const initialId = spiesA.addLabels.mock.calls[0][0].requestId;

    const { agent: agentB, spies: spiesB } = buildAgent();
    await agentB.run(cloneTask({ tags: ["fast-track:eligible", "fast-track"] }), { approvalsCount: 1 });
    const sameOrderId = spiesB.addLabels.mock.calls[0][0].requestId;
    expect(sameOrderId).toBe(initialId);

    const { agent: agentC, spies: spiesC } = buildAgent();
    await agentC.run(cloneTask({ tags: ["fast-track", "fast-track:eligible", "quality_gate_failed"] }), { approvalsCount: 1 });
    const differentId = spiesC.addLabels.mock.calls[0][0].requestId;
    expect(differentId).not.toBe(initialId);
  });

  it("genera el mismo requestId de reviewers aunque cambie el orden", async () => {
    const { agent: agentA, spies: spiesA } = buildAgent({ reviewers: ["alice", "team/devs"] });
    await agentA.run(cloneTask(), { approvalsCount: 1 });
    const firstId = spiesA.requestReviewers.mock.calls[0][0].requestId;

    const { agent: agentB, spies: spiesB } = buildAgent({ reviewers: ["team/devs", "alice"] });
    await agentB.run(cloneTask(), { approvalsCount: 1 });
    const secondId = spiesB.requestReviewers.mock.calls[0][0].requestId;

    expect(secondId).toBe(firstId);
  });

  it("cambia el requestId del project cuando el estado es distinto", async () => {
    const { agent: agentA, spies: spiesA } = buildAgent();
    await agentA.run(cloneTask({ status: "pr" }), { approvalsCount: 1 });
    const inReviewId = spiesA.setProjectStatus.mock.calls[0][0].requestId;

    const { agent: agentB, spies: spiesB } = buildAgent();
    await agentB.run(cloneTask({ status: "dev" }), { approvalsCount: 1 });
    const inProgressId = spiesB.setProjectStatus.mock.calls[0][0].requestId;

    expect(inProgressId).not.toBe(inReviewId);
  });

  it("detecta ADRs en el texto cuando no existen links explícitos", async () => {
    const { agent, spies } = buildAgent();
    const task = cloneTask({
      links: { github: { owner: "acme", repo: "project", issueNumber: 7 }, adr: [] },
      description: "Cambios alineados con ADR-010 definidos por arquitectura"
    });

    const summary = await agent.run(task, { approvalsCount: 1 });

    expect(summary.checklist).toContain("[x] ADR referenciados (ADR-010)");

    const prCall = spies.openPullRequest.mock.calls[0][0];
    expect(prCall.body).toContain("- [x] ADR referenciados (ADR-010)");
  });
});
