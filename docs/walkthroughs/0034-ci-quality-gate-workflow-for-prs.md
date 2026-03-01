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

Added `.github/workflows/quality-gate.yml`: a GitHub Actions workflow that runs the full
quality gate on every pull request targeting `main`, posts a structured Markdown report as
a PR comment with upsert behavior (single comment updated on every push), and blocks merge
via a required status check when any critical gate threshold is breached.

---

## Context

Task 0015 covered only vulnerability gating in CI. There was no broader quality gate
feedback on PRs. AR01 (Tasks 0010–0031) established the `pnpm q:*` command surface
that this workflow consumes. The upsert comment pattern avoids PR comment spam
on force-pushes while keeping the quality report always visible.

Issue #158 was placed under EP07 rather than AR01 because AR01 is complete and this
is a forward-looking DX improvement — not a remediation item.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| `gh` CLI for comment upsert (no third-party action) | Avoids dependency on external actions that can break or introduce supply-chain risk |
| HTML anchor marker `<!-- quality-gate-report -->` | Stable, invisible identifier that survives comment edits; first line of body used as selector |
| Minimal permissions (`pull-requests: write`, `contents: read`) | Principle of least privilege; no admin or write-to-code access needed |
| `continue-on-error: true` on all metric steps | Ensures the comment is always posted even when a gate fails, giving full feedback |
| Individual step `outcome` as gate signals | `pnpm q:gate` does not read `.qreport/*.json` artifacts at runtime (metrics are injected via deps); individual command exit codes are the reliable signals |
| Coverage tests run before `pnpm q:coverage` | `q:coverage` only reads existing coverage files; test:coverage for each package must run first |
| Gate verdict step uses `if: always()` | Ensures the final exit code is set even if earlier steps failed |

---

## Implementation Notes

### Workflow structure

The workflow has four logical phases:

1. **Setup** — checkout, pnpm/node setup, install, rebuild native modules (same pattern as `ci.yml`).
2. **Metric collection** — seven steps with `continue-on-error: true` so all data is captured regardless of individual failures:
   - `pnpm q:tests` → `.qreport/tests.json`
   - `pnpm --filter @openclaw/quality-gate test:coverage && pnpm --filter @openclaw/plugin-product-team test:coverage` → coverage files
   - `pnpm q:coverage` → `.qreport/coverage.json` (reads coverage files from previous step)
   - `pnpm q:lint` → `.qreport/lint.json`
   - `pnpm q:complexity` → `.qreport/complexity.json`
   - `pnpm q:gate` → `.qreport/gate.json`
   - `pnpm verify:vuln-policy` → stdout captured to `/tmp/vuln-output.txt`; exit code to `$GITHUB_OUTPUT`
3. **PR comment** — parses `.qreport/*.json` with `jq`, builds a Markdown table, upserts via `gh api`.
4. **Gate verdict** — sets workflow exit code non-zero if tests, lint, or vulnerability policy failed.

### Comment upsert logic

```bash
EXISTING_ID=$(gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
  --jq '.[] | select(.body | startswith("<!-- quality-gate-report -->")) | .id' \
  | head -1)
if [ -n "$EXISTING_ID" ]; then
  gh api "repos/${REPO}/issues/comments/${EXISTING_ID}" --method PATCH --field body=@/tmp/qg-report.md
else
  gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" --method POST --field body=@/tmp/qg-report.md
fi
```

The anchor `<!-- quality-gate-report -->` is placed as the first line of the comment body so
`startswith(...)` can detect it without substring scanning ambiguities.

### Artifact paths

`.qreport/` artifacts land under `extensions/quality-gate/` (the package CWD when pnpm runs
the filtered script). Paths in the workflow are referenced as `extensions/quality-gate/.qreport/`.

### Gate thresholds

No thresholds are hardcoded in the workflow. All thresholds are read from the existing project configuration
consumed by `pnpm q:lint`, `pnpm q:complexity`, and `pnpm q:gate`.

### Required branch protection setup

To use `quality-gate` as a merge-blocking required status check:
1. Navigate to **Settings → Branches → Branch protection rules** for `main`.
2. Enable **Require status checks to pass before merging**.
3. Add `quality-gate` (the job name from this workflow) as a required check.

---

## Commands Run

```bash
# Quality checks (local validation)
pnpm lint       # passed — zero errors
pnpm typecheck  # passed — zero type errors
pnpm test       # passed — 403 tests across all packages

# actionlint not available locally; workflow YAML reviewed manually
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/quality-gate.yml` | Created | PR quality gate workflow with comment upsert |
| `docs/roadmap.md` | Updated | Task 0034 status: PENDING → IN_PROGRESS → DONE |
| `docs/tasks/0034-ci-quality-gate-workflow-for-prs.md` | Updated | Status → DONE, DoD checked |
| `docs/walkthroughs/0034-ci-quality-gate-workflow-for-prs.md` | Updated | This file |

---

## Tests

| Suite | Tests | Passed | Notes |
|-------|-------|--------|-------|
| `pnpm test` (all packages) | 403 | 403 | No regressions |
| `pnpm lint` | — | ✅ | Zero errors |
| `pnpm typecheck` | — | ✅ | Zero type errors |
| actionlint | — | N/A | Not installed locally; manual review performed |

---

## Follow-ups

- Add Slack/Teams notification on gate failure for high-priority PRs
- Extend coverage comment to include per-package breakdown (not just quality-gate package)
- Consider caching `pnpm store` in the workflow to reduce install time
- Add `actionlint` to CI or dev toolchain for automated workflow YAML validation
- When `q:gate` CLI gains metric-injection flags, wire `.qreport/*.json` values through to it

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
