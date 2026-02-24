# Walkthrough: cr-0163 -- Guard and Atomicity Fixes

## Task Reference

- Task: `docs/tasks/cr-0163-guard-and-atomicity-fixes.md`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/163
- Branch: `feat/0003-role-execution`

---

## Summary

Five automated review findings addressed (2 MUST_FIX, 3 SHOULD_FIX).

---

## Fixes Applied

### Fix 1 — Atomicity: steps + transition in single transaction (`workflow-step-run.ts`)

**Problem**: `runWorkflowSteps` and `transition` each created their own `db.transaction`. If the transition failed (guard rejection, lease conflict, stale rev), the metadata writes from `runWorkflowSteps` were already committed, leaving the task in an inconsistent state.

**Fix**: Wrapped the entire `execute` body in a single outer `deps.db.transaction`. Both inner `db.transaction` calls degrade to savepoints under `better-sqlite3`'s nesting semantics and are automatically rolled back if the outer transaction fails.

**Test added**: `should roll back metadata when transition fails due to guard failure` — verifies that task `rev` and `metadata` are unchanged when a guard blocks the transition.

---

### Fix 2 — Guard bypass: non-object and unknown-severity violations (`transition-guards.ts`)

**Problem**: `evaluateInReviewToQa` called `violations.some(...)` and returned `false` for non-object entries, silently allowing malformed metadata like `["critical"]` to pass the high/critical guard. Unknown string severities (e.g. `"fatal"`) were also silently passed.

**Fix**: Non-object entries and entries with unrecognised `severity` values now return `true` (treated as high severity), making the guard conservative rather than permissive.

**Tests added**:
- `should block in_review -> qa when violations array contains non-object entry`
- `should block in_review -> qa when a violation has unknown/malformed severity`

---

### Fix 3 — Guard bypass: `contracts` entries not validated (`transition-guards.ts`)

**Problem**: `evaluateDesignToInProgress` accepted `[null]` or `['']` as valid `contracts` arrays.

**Fix**: Added `.some((contract) => asNonEmptyString(contract))` check; the guard now requires at least one non-empty string entry.

**Test added**: `should block design -> in_progress when contracts contains only empty strings`

---

### Fix 4 — Invalid coverage thresholds accepted (`transition-guards.ts`)

**Problem**: `resolveTransitionGuardConfig` used `asPositiveNumber` which accepted any positive finite number, including values > 100 (e.g. 150), making transitions permanently impossible.

**Fix**: Replaced with `asCoverageThreshold` which requires the value to be in `[0, 100]`. Out-of-range values fall back to defaults. Removed now-unused `asPositiveNumber`.

**Test added**: `should reject coverage threshold > 100 and fall back to default`

---

### Fix 5 — Redundant clones per shell/script step (`step-runner.ts`)

**Problem**: `cloneCustomSteps(metadata.custom_steps)` was called inside the loop for every non-llm step, creating O(n) intermediate objects.

**Fix**: `cloneCustomSteps` called once before the loop; `metadata.custom_steps = customSteps` is assigned once after the loop.

---

## Files Changed

| File | Action |
|------|--------|
| `extensions/product-team/src/tools/workflow-step-run.ts` | Outer transaction wrapping steps + transition |
| `extensions/product-team/src/orchestrator/transition-guards.ts` | Violations guard, contracts validation, coverage range, remove dead helper |
| `extensions/product-team/src/orchestrator/step-runner.ts` | Move `cloneCustomSteps` before loop |
| `extensions/product-team/test/orchestrator/transition-guards.test.ts` | +4 new guard tests |
| `extensions/product-team/test/tools/workflow-step-run.test.ts` | +1 atomicity rollback test |
| `docs/tasks/cr-0163-guard-and-atomicity-fixes.md` | Created |
| `docs/walkthroughs/cr-0163-guard-and-atomicity-fixes.md` | Created |

---

## Tests

| Suite | Before | After |
|-------|--------|-------|
| product-team | 142 | 147 |
| Lint | pass | pass |
| Typecheck | pass | pass |
