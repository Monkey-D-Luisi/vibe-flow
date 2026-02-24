# Task: cr-0163 -- Guard and Atomicity Fixes

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | #163 |
| Priority | HIGH |
| Created | 2026-02-24 |
| Branch | `feat/0003-role-execution` |

---

## Goal

Address all MUST_FIX and SHOULD_FIX findings from the automated review of PR #163.

---

## Findings and Classification

| # | Severity | Source | Finding |
|---|----------|--------|---------|
| 1 | MUST_FIX | Gemini | `workflow-step-run.ts`: steps and transition run in separate transactions — metadata committed even if transition fails |
| 2 | MUST_FIX | Copilot | `transition-guards.ts`: non-object entries in `violations` silently ignored, bypass high/critical guard |
| 3 | SHOULD_FIX | Copilot | `transition-guards.ts`: `contracts` array only checked for non-empty, not that entries are non-empty strings |
| 4 | SHOULD_FIX | Copilot | `transition-guards.ts`: coverage thresholds allow values > 100, creating impossible-to-satisfy transitions |
| 5 | SHOULD_FIX | Gemini | `step-runner.ts`: `cloneCustomSteps` called per-iteration inside loop, creating unnecessary intermediate objects |

---

## Changes

- `workflow-step-run.ts`: Wrapped `runWorkflowSteps` + `transition` in a single outer `db.transaction` for full atomicity
- `transition-guards.ts`: Non-object and unknown-severity violation entries now conservatively treated as high severity
- `transition-guards.ts`: `evaluateDesignToInProgress` validates that `contracts` has at least one non-empty string entry
- `transition-guards.ts`: Added `asCoverageThreshold` (range 0–100); `resolveTransitionGuardConfig` now rejects out-of-range values
- `step-runner.ts`: `cloneCustomSteps` moved before the loop; `metadata.custom_steps` assigned once after the loop
- Tests extended for all five fixes (+5 new test cases)
