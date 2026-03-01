# Walkthrough: CR-0207 — PR #207 Review Fixes

## Summary

Addresses 4 findings from Gemini Code Assist and GitHub Copilot review of PR #207
(E2E integration test suite for the autonomous pipeline).

## Findings and Resolutions

### M1 — Misleading comment in design-skip.test.ts

**File:** `extensions/product-team/test/e2e/scenarios/design-skip.test.ts:90`

The second test scenario (`allows multiple stage skips when appropriate`) had a comment
"Skip DECOMPOSITION (single-task fix, no decomposition needed)" but the `pipelineSkip`
call targets `stage: 'REFINEMENT'` and the assertion is
`assertStageSkipped(skipDecomp, 'REFINEMENT', 'DECOMPOSITION')`. The skipped stage is
REFINEMENT, not DECOMPOSITION.

**Fix:** Updated comment to "Skip REFINEMENT (single-task fix, scope is already well-defined,
no further refinement needed)".

### M2 — Spurious `pipeline.retry` mutation in quality-gate-fail.test.ts

**File:** `extensions/product-team/test/e2e/scenarios/quality-gate-fail.test.ts:129-135`

The final block of the QA scenario called `pipeline.retry` under a comment claiming it
"verifies tech-lead retry count". But `pipeline.retry` is a write operation — it always
increments `retryCount` and overwrites `pipelineStage`. The only assertion was
`expect(retried).toBe(true)`, which is vacuously true regardless of scenario outcome.
The call also left the task at an inconsistent stage at test end.

**Fix:** Removed the entire `pipeline.retry` block. The retry cycle is fully validated by
earlier assertions: `assertStage(statusAfterSendBack, 'IMPLEMENTATION')`, inbox checks for
both the fix request and the "tests fixed" response, and the final `assertStage(statusAfterPass, 'REVIEW')`.

### S1 — Wrong paths in docs/tasks/0045-e2e-integration-tests.md

**Files:** D1 tree (line ~30) and D3 CI script (line ~90) in
`docs/tasks/0045-e2e-integration-tests.md`.

The D1 directory tree used `tests/e2e/` as the root — this path does not exist. Actual
location is `extensions/product-team/test/e2e/`. The D3 CI section also showed
`pnpm vitest run tests/e2e/` and mentioned `--tag e2e`, neither of which matched the
actual `package.json` scripts.

**Fix:** Updated D1 tree root to `extensions/product-team/test/e2e/`. Updated D3 to show
the actual root and extension-level scripts as implemented.

### S2 — Silent fixture error swallow in llm-provider.ts

**File:** `extensions/product-team/test/e2e/mocks/llm-provider.ts:36-40`

`getFixtures` wrapped `loadFixture` in a try/catch that returned `null` on any
`readFileSync`/`JSON.parse` failure. A missing or malformed fixture meant the mock
silently fell back to `{ status: 'completed', stage }`, and the E2E test would pass
without ever using the intended canned response — masking broken fixture files.

**Fix:** Removed the try/catch. `loadFixture` now throws on failure, surfacing any fixture
issue immediately during test setup rather than hiding it behind a silent fallback.

### S3 — Missing `metadata.projectId` assertion in multi-project.test.ts

**File:** `extensions/product-team/test/e2e/scenarios/multi-project.test.ts:58`

The test "tasks are associated with their project at creation" confirmed task count (2) and
ID inequality, but never asserted that the project tag was actually stored in task metadata.
A bug where `pipeline.start` ignores `projectId` would have gone undetected.

**Fix:** Added assertions after the ID check using `harness.deps.taskRepo.getById` to load
each persisted task and assert `metadata.projectId` equals the expected project ID.

## Files Changed

| File | Change |
|------|--------|
| `extensions/product-team/test/e2e/scenarios/design-skip.test.ts` | Fix misleading comment |
| `extensions/product-team/test/e2e/scenarios/quality-gate-fail.test.ts` | Remove spurious `pipeline.retry` call |
| `extensions/product-team/test/e2e/mocks/llm-provider.ts` | Remove silent error swallow |
| `extensions/product-team/test/e2e/scenarios/multi-project.test.ts` | Add `projectId` metadata assertion |
| `docs/tasks/0045-e2e-integration-tests.md` | Fix D1 tree path, D3 CI scripts |
| `docs/tasks/cr-0207-pr207-review-fixes.md` | New task document |
| `docs/walkthroughs/cr-0207-pr207-review-fixes.md` | This walkthrough |

## Skipped Findings

| Finding | Rationale |
|---------|-----------|
| `assertions.ts` unsafe `as` casts | Uniform test-helper pattern; all callers pass correctly-shaped tool results. Adding redundant runtime guards would bloat helpers without meaningful safety gain. |
| Singleton mocks (`mockGitHub`, `mockStitch`) | Each class exposes a `reset()` method and none of the singletons are imported in E2E scenario tests — risk is theoretical until actual usage. |
| Inbox isolation same-agent test | Copilot suggestion is architecturally sound but requires adding `taskRef`-scoped inbox filtering to `team.inbox`, which is a feature addition outside CR scope. Filed for future consideration. |
