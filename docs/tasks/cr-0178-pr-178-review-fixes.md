# Task: cr-0178 -- PR #178 Review Fixes

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | #178 |
| Priority | MEDIUM |
| Created | 2026-02-26 |
| Branch | `feat/0016-upgrade-ajv-and-verify-schema-security` |

---

## Goal

Execute the `code review` workflow for PR #178, classify review feedback, apply
required fixes, and prepare the PR for merge after green checks.

---

## Findings and Classification

| # | Severity | Source | Finding |
|---|----------|--------|---------|
| 1 | SHOULD_FIX | GitHub inline review (`discussion_r2857196842`, `discussion_r2857196849`) | Pin `ajv` to exact `8.18.0` in both workspace manifests for deterministic security remediation baseline. |
| 2 | OUT_OF_SCOPE | PR comment | `chatgpt-codex-connector` usage-limit notice is not a code defect in this repository. |

---

## Definition of Done

- [x] MUST_FIX items resolved
- [x] SHOULD_FIX items resolved or documented with rationale
- [x] Independent review findings captured with severity
- [x] Review artifact committed (`docs/tasks/cr-0178-*` + `docs/walkthroughs/cr-0178-*`)
- [x] Validation gates executed (`pnpm lint`, `pnpm typecheck`, `pnpm test`)
- [x] PR #178 checks green and merged
