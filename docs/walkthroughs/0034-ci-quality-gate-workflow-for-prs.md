# Walkthrough: 0034 -- CI Quality Gate Workflow for Pull Requests

## Task Reference

- Task: `docs/tasks/0034-ci-quality-gate-workflow-for-prs.md`
- Epic: EP07 — DX & Platform Ops
- Branch: `feat/0034-ci-quality-gate-workflow-for-prs`
- PR: _pending_
- Source Issue: GitHub #158
- Related Task: `0015` (vulnerability CI gating — partial coverage)

---

## Summary

_Pending implementation. Task spec activated from open-issues-intake.md on 2026-03-01._

This task will add a GitHub Actions workflow that runs the full quality gate (coverage,
complexity, lint, vulnerabilities) on every PR, posts a structured quality report as a
PR comment with upsert behavior, and blocks merge via a required status check when any
gate threshold is breached.

---

## Context

Task 0015 covered only vulnerability gating in CI. There was no broader quality gate
feedback on PRs. AR01 (Tasks 0010–0031) established the `pnpm q:*` command surface
that this workflow will consume. The upsert comment pattern avoids PR comment spam
on force-pushes while keeping the quality report always visible.

Issue #158 was placed under EP07 rather than AR01 because AR01 is complete and this
is a forward-looking DX improvement — not a remediation item.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| `gh` CLI for comment upsert (no third-party action) | Avoids dependency on external actions that can break or introduce supply-chain risk |
| HTML anchor marker `<!-- quality-gate-report -->` | Stable, invisible identifier that survives comment edits |
| Minimal permissions (`pull-requests: write`, `contents: read`) | Principle of least privilege; no admin or write-to-code access needed |
| Track as EP07, not AR01 | AR01 is DONE; this is a net-new capability, not a remediation of an existing finding |

---

## Implementation Notes

### Approach

_To be completed during implementation._

### Key Changes

_To be completed during implementation._

---

## Commands Run

```bash
# To be filled during implementation
actionlint .github/workflows/quality-gate.yml
pnpm q:gate
pnpm q:tests
pnpm q:coverage
pnpm q:lint
pnpm q:complexity
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/quality-gate.yml` | Created | PR quality gate workflow |

_Exact file list to be updated during implementation._

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| actionlint | - | - | - |
| E2E (manual PR) | - | - | - |

_To be filled during implementation._

---

## Follow-ups

- Add Slack/Teams notification on gate failure for high-priority PRs
- Extend comment to include per-package breakdown (not just workspace aggregate)
- Consider caching `pnpm store` in the workflow to reduce install time

---

## Checklist

- [ ] Task spec read end-to-end
- [ ] TDD cycle followed (Red-Green-Refactor)
- [ ] All ACs verified
- [ ] Quality gates passed
- [ ] Files changed section complete
- [ ] Follow-ups recorded
