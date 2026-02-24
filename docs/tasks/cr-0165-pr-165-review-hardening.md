# Task: cr-0165 -- PR #165 Review Hardening

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | #165 |
| Priority | HIGH |
| Created | 2026-02-24 |
| Branch | `feat/0005-github-integration` |

---

## Goal

Execute the `code review` workflow for PR #165 and resolve blocking findings discovered during independent review.

---

## Findings and Classification

| # | Severity | Source | Finding |
|---|----------|--------|---------|
| 1 | MUST_FIX | Independent review | `safeSpawn` stripped auth/config environment required by `gh`, causing authenticated sessions to fail under tool execution. |
| 2 | SHOULD_FIX | Independent review | `vcs.pr.update` accepted `labels: []`, treating it as an update while executing no label mutation. |

---

## Changes

- Preserved cross-platform `gh` auth/config env keys in `src/github/spawn.ts`.
- Added regression coverage for auth environment propagation in `test/github/spawn.test.ts`.
- Enforced non-empty `labels` for `vcs.pr.update` in service + schema.
- Added regression tests for empty-label rejection in schema, service, and tool layers.
- Added code-review task/walkthrough artifacts for PR #165.

---

## Definition of Done

- [x] MUST_FIX items resolved
- [x] SHOULD_FIX items resolved or explicitly classified as non-blocking
- [x] Review artifact committed (`docs/tasks/cr-0165-*` + `docs/walkthroughs/cr-0165-*`)
- [x] Validation gates passed (`pnpm typecheck`, `pnpm lint`, `pnpm test`)
