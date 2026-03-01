# Task: 0034 -- CI Quality Gate Workflow for Pull Requests

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP07 — DX & Platform Ops |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-01 |
| Branch | `feat/0034-ci-quality-gate-workflow-for-prs` |
| Source Issue | GitHub #158 |
| Related Task | `0015` (vulnerability CI gating — partial coverage) |

---

## Goal

Add a GitHub Actions workflow that runs the full quality gate on every pull request,
posts a structured Markdown report as a PR comment with upsert behavior (no duplicate
comments), and blocks merge via a required status check when any gate threshold is breached.

---

## Context

Task 0015 (Enforce CI High Vulnerability Gating) added CI enforcement for vulnerability
checks only. There is no workflow that runs coverage, complexity, or lint gates on PRs
and surfaces results in the PR interface. Developers must run `pnpm q:gate` locally and
there is no automated feedback loop.

GitHub issue #158 (open-issues-intake.md) explicitly calls for: a PR quality-gate workflow
and comment-upsert behavior. Decision: placed under EP07 post-AR01 (not under AR01, since
AR01 is DONE and this is a forward-looking DX improvement rather than a remediation item).

---

## Scope

### In Scope

- GitHub Actions workflow `.github/workflows/quality-gate.yml` triggered on `pull_request` events targeting `main`
- Runs `pnpm q:tests`, `pnpm q:coverage`, `pnpm q:lint`, `pnpm q:complexity` (metrics collection), then `pnpm q:gate` (reads collected artifacts to evaluate thresholds), then `pnpm verify:vuln-policy` (separate vulnerability policy check)
- Posts a formatted Markdown quality report as a PR comment
- Upsert behavior: updates an existing quality-gate comment instead of creating duplicates (identified by HTML anchor marker)
- Workflow exits non-zero if any gate threshold is breached
- Required status check surface on the PR merge gate

### Out of Scope

- npm publish pipeline (Task 0033)
- Extension scaffolding (Task 0032)
- Slack / external notification integrations
- Custom gate threshold configuration per PR (thresholds come from existing config)

---

## Requirements

1. Workflow must trigger on all PRs targeting `main`.
2. Gate thresholds must be read from existing project config — no hardcoded values.
3. Comment upsert must use a unique HTML anchor marker to identify the bot comment.
4. Failed gate must produce a non-zero workflow exit code; branch protection can use this as a required check.
5. The comment must include: coverage %, complexity score, lint error count, vulnerability policy result (`pnpm verify:vuln-policy`), and overall PASS/FAIL verdict.
6. The workflow must have minimal permissions: `pull-requests: write`, `contents: read`.

---

## Acceptance Criteria

- [ ] AC1: Opening a PR against `main` triggers `quality-gate.yml` and posts a quality report comment.
- [ ] AC2: Pushing a new commit to the PR updates the existing comment (upsert), not creates a new one.
- [ ] AC3: If coverage drops below threshold, the workflow reports it as a warning (⚠️) in the PR comment. Coverage is advisory — it does not block merge. Full enforcement requires future work to wire threshold comparison into `q:coverage`. See follow-up in walkthrough.
- [ ] AC4: Quality report comment includes coverage %, complexity, lint errors, and PASS/FAIL verdict.
- [ ] AC5: Branch protection rule can reference `quality-gate` as a required status check.

---

## Constraints

- Must use `gh` CLI for comment upsert — no third-party action for comment management.
- Gate thresholds must not be duplicated from existing config files.
- Workflow permissions must be minimal (`pull-requests: write`, `contents: read`).

---

## Implementation Steps

1. Create `.github/workflows/quality-gate.yml` with `pull_request` trigger targeting `main`.
2. Add steps: checkout, pnpm install, run metric-collecting commands (`pnpm q:tests && pnpm q:coverage && pnpm q:lint && pnpm q:complexity`), then `pnpm q:gate` (reads collected artifacts), then `pnpm verify:vuln-policy`.
3. Capture exit codes and key metrics into workflow outputs / env vars.
4. Implement comment upsert using `gh pr comment` with a `<!-- quality-gate-report -->` HTML anchor:
   - Check if a comment with the anchor exists via `gh pr view --json comments`.
   - If yes, edit it; if no, create it.
5. Set workflow exit code based on combined gate results.
6. Document required branch protection configuration in this task spec and walkthrough.

---

## Testing Plan

- Workflow YAML linting with `actionlint`.
- Manual end-to-end: open a test PR, verify comment is posted and status check appears.
- Regression: push a second commit to the same PR, verify comment is updated (not duplicated).
- Failure path: introduce a known coverage drop, verify workflow fails and comment shows FAIL verdict.

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] Code reviewed (if applicable)
- [x] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
