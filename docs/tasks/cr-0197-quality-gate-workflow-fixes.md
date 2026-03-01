# CR-0197: Quality Gate Workflow Fixes

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | #197 |
| Branch | `feat/0034-ci-quality-gate-workflow-for-prs` |
| Created | 2026-03-01 |

---

## Findings

### MUST_FIX

| ID | File | Line | Finding |
|----|------|------|---------|
| F1 | `.github/workflows/quality-gate.yml` | 14 | Job `name: Quality gate` overrides the GitHub check context away from `quality-gate`. AC5 requires branch protection to reference `quality-gate`, but the actual check context will be "Quality Gate / Quality gate". Remove the `name` override so the job key (`quality-gate`) becomes the status check context. |
| F2 | `.github/workflows/quality-gate.yml` | 64–67 | `pnpm q:gate` step always exits non-zero in CI because `q:gate` reads metrics from injected deps at build time, not from `.qreport/*.json` artifacts. With `continue-on-error: true` the failure is silent but the `steps.gate.outcome` is unused — the step produces misleading output and an incorrect `gate.json`. Remove the step. |
| F3 | `.github/workflows/quality-gate.yml` | 186 | Missing `--paginate` on `gh api` comment search: only the first 30 comments are inspected. On PRs with more than 30 comments the anchored comment is not found and a duplicate is created on every push. |

### SHOULD_FIX

| ID | File | Line | Finding |
|----|------|------|---------|
| F4 | `.github/workflows/quality-gate.yml` | top-level | No `concurrency` group: rapid pushes can trigger parallel runs that both fail to find the existing comment and each create a new one. |
| F5 | `.github/workflows/quality-gate.yml` | 151–161, 212–223 | Complexity outcome excluded from gate verdict: both the comment header (PASS/FAIL) and the final `Gate verdict` step ignore `steps.complexity.outcome`. A PR that exceeds the complexity threshold still shows PASS and the workflow exits 0. |
| F6 | `.github/workflows/quality-gate.yml` | 79–198 | Fork PR write permission: `GITHUB_TOKEN` is read-only on fork PRs even with `pull-requests: write`. The comment step will 403 and hard-fail the job, blocking the PR. Guard the step with `if: github.event.pull_request.head.repo.full_name == github.repository`. |
| F7 | `docs/tasks/0034-ci-quality-gate-workflow-for-prs.md` | 74, 112 | DoD marks "All ACs met" but AC3 ("coverage drops below threshold → workflow exits non-zero") is not satisfied: `pnpm q:coverage` is report-only (exits 0 regardless of threshold). Update to uncheck AC3 and add a clarifying note that coverage is advisory. |

### NIT

| ID | File | Line | Finding |
|----|------|------|---------|
| N1 | `docs/walkthroughs/0034-ci-quality-gate-workflow-for-prs.md` | 98 | Branch protection instructions reference `quality-gate` but the job display name was `Quality gate`. After F1 fix both align; update the note to confirm the context name matches the job key. |
| N2 | `docs/walkthroughs/0034-ci-quality-gate-workflow-for-prs.md` | — | Custom runner note: `jq` and `gh` are pre-installed on `ubuntu-latest` but not guaranteed on custom runners pointed to by `vars.RUNNER_LABEL`. Document as a prerequisite. |
