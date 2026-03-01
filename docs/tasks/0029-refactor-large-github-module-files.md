# Task: 0029 -- Refactor Large GitHub Module Files

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation 2026-02-27 |
| Priority | MEDIUM |
| Scope | MAJOR |
| Created | 2026-02-27 |
| Branch | `feat/0029-refactor-large-github-module-files` |
| Source Finding | D-008 (audit 2026-02-27) |

---

## Goal

Split `pr-bot.ts` (464 lines) and `ci-feedback.ts` (430 lines) into smaller modules organized by responsibility, reducing change risk and improving navigability.

---

## Context

Source finding: **D-008** — Both `extensions/product-team/src/github/pr-bot.ts` and `extensions/product-team/src/github/ci-feedback.ts` are identified as maintainability hotspots. Each mixes event handling, state management, business logic, utility functions, and type definitions. This makes changes riskier and harder to test in isolation.

Both files have good test coverage at the integration level (pr-bot.test.ts, ci-feedback.test.ts), but the mixed-concern structure creates implicit coupling between concerns.

---

## Scope

### In Scope

- Split `pr-bot.ts` into at minimum: `pr-bot-core.ts` (main orchestration), `pr-bot-reviewers.ts` (reviewer assignment logic), `pr-bot-labels.ts` (label sync logic), with type definitions extracted to `pr-bot-types.ts`
- Split `ci-feedback.ts` into at minimum: `ci-feedback-handler.ts` (webhook routing), `ci-feedback-transition.ts` (state transition logic), `ci-feedback-comments.ts` (PR comment composition)
- Maintain the same external API surface (exported functions/types must remain identical)
- All existing tests must continue to pass without modification to test files

### Out of Scope

- Adding new functionality
- Changing the logic itself (pure refactor)
- Adding new tests (covered by existing test suites)

---

## Requirements

1. Neither `pr-bot.ts` nor `ci-feedback.ts` may exceed 200 lines after the refactor.
2. All exports that existed before the refactor must still be available (backward-compatible refactor).
3. All existing tests (`test/github/pr-bot.test.ts`, `test/github/ci-feedback.test.ts`) must pass unchanged.

---

## Acceptance Criteria

- [x] AC1: `pr-bot.ts` is replaced by 3+ smaller files, none exceeding 200 lines.
- [x] AC2: `ci-feedback.ts` is replaced by 3+ smaller files, none exceeding 200 lines.
- [x] AC3: All existing GitHub module tests pass unchanged.
- [x] AC4: `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.

---

## Constraints

- This is a pure refactor — zero behavior changes.
- Must not change test files (proves API stability).
- Re-export barrel file may be used to maintain backward-compatible imports.

---

## Implementation Steps

1. Read `src/github/pr-bot.ts` and `src/github/ci-feedback.ts` in full.
2. Map responsibilities in each file: types, event handlers, business logic, utilities.
3. Create extraction plan with target filenames and responsibility boundaries.
4. Extract `pr-bot-types.ts`, `pr-bot-reviewers.ts`, `pr-bot-labels.ts`; update `pr-bot.ts` to re-export or become the main orchestrator.
5. Extract `ci-feedback-handler.ts`, `ci-feedback-transition.ts`, `ci-feedback-comments.ts`; update `ci-feedback.ts` similarly.
6. Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Testing Plan

- All existing `test/github/pr-bot.test.ts` and `test/github/ci-feedback.test.ts` tests must pass unchanged.
- TypeScript compilation validates import correctness.

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] All existing tests still pass
- [x] No file in the refactored set exceeds 200 lines
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] PR created and linked

---

## Finding Snapshot (Immutable)

| Field | Value |
|-------|-------|
| Source Finding ID | D-008 |
| Axis | Development |
| Severity | MEDIUM |
| Confidence | HIGH |
| Evidence | `pr-bot.ts` (464 lines), `ci-feedback.ts` (430 lines) — mixed concerns, types inline, business logic interleaved |
| Impact | Large files increase change risk; side effects hard to trace; harder for new contributors |
| Recommendation | Split into modules by responsibility; extract types; maintain backward-compatible exports |
