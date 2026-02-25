# Task: cr-0166 -- PR #166 Review Fixes

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | #166 |
| Priority | HIGH |
| Created | 2026-02-25 |
| Branch | `feat/0006-quality-observability` |

---

## Goal

Execute the `code review` workflow for PR #166 and resolve blocking findings from independent review.

---

## Findings and Classification

| # | Severity | Source | Finding |
|---|----------|--------|---------|
| 1 | MUST_FIX | Independent review | Quality tools accepted `workingDir` outside workspace root, bypassing containment guarantees. |
| 2 | MUST_FIX | Independent review | `quality.gate` could pass lint/complexity checks when evidence was missing. |
| 3 | SHOULD_FIX | Independent review | `workflow.events.query` returned filtered events but `avgCycleTimeMs` used an unfiltered dataset. |
| 4 | SHOULD_FIX | Independent review | `quality.lint.paths` was accepted but ignored; `quality.complexity.maxCyclomatic/topN` were accepted but unused. |

---

## Changes

- Enforced workspace containment in `resolveWorkingDir(...)` for all quality tools.
- Updated gate policy behavior so missing lint/complexity evidence fails gate checks with remediation messaging.
- Updated `quality.gate` metric extraction to preserve missing evidence as `undefined` for policy evaluation.
- Applied query filters consistently to `avgCycleTimeMs` in `SqliteEventRepository.queryEvents(...)`.
- Implemented `quality.lint.paths` in default command generation and rejected whitespace-containing paths.
- Removed unsupported complexity params (`maxCyclomatic`, `topN`) from schema to match implemented behavior.
- Added and updated regression tests for all fixes.

---

## Definition of Done

- [x] MUST_FIX items resolved
- [x] SHOULD_FIX items resolved or explicitly classified as non-blocking
- [x] Review artifact committed (`docs/tasks/cr-0166-*` + `docs/walkthroughs/cr-0166-*`)
- [x] Validation gates passed (`pnpm typecheck`, `pnpm lint`, `pnpm test`)
