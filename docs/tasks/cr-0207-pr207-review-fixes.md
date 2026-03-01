# CR-0207 — PR #207 Review Fixes

| Field        | Value                                        |
|--------------|----------------------------------------------|
| PR           | #207 feat(task-0045): E2E integration tests  |
| Reviewers    | Gemini Code Assist, GitHub Copilot           |
| Status       | DONE                                         |

## Findings Addressed

### MUST_FIX

#### M1 — design-skip.test.ts: misleading comment
**File:** `extensions/product-team/test/e2e/scenarios/design-skip.test.ts:90`
**Issue:** Comment reads "Skip DECOMPOSITION (single-task fix, no decomposition needed)" but the code calls
`pipelineSkip` with `stage: 'REFINEMENT'` and asserts `assertStageSkipped(skipDecomp, 'REFINEMENT', 'DECOMPOSITION')`.
The skipped stage is REFINEMENT, not DECOMPOSITION.
**Fix:** Update comment to say "Skip REFINEMENT".

#### M2 — quality-gate-fail.test.ts: spurious `pipeline.retry` call
**File:** `extensions/product-team/test/e2e/scenarios/quality-gate-fail.test.ts:129-135`
**Issue:** The test calls `pipeline.retry` at the end under the guise of "verifying retry count", but
`pipeline.retry` always increments `retryCount` and writes `pipelineStage` — it is a mutation, not a query.
The call asserts only that `retried === true`, which is always true, making it a vacuous assertion that also
corrupts pipeline state at test end.
**Fix:** Remove the `pipeline.retry` block. The retry cycle is already validated by `assertStage(statusAfterSendBack, 'IMPLEMENTATION')` and inbox assertions above it.

### SHOULD_FIX

#### S1 — docs/tasks/0045: wrong paths in D1 tree and D3 CI script
**File:** `docs/tasks/0045-e2e-integration-tests.md:30,90`
**Issue:** The D1 deliverable directory tree and D3 CI integration section reference `tests/e2e/` which does not
exist. Actual location is `extensions/product-team/test/e2e/`. The D3 script also claims tests run with
`--tag e2e` but that tag is not applied in the implementation.
**Fix:** Update tree root to `extensions/product-team/test/e2e/` and update D3 script to match actual
`package.json` scripts.

#### S2 — llm-provider.ts: silent error swallow in `getFixtures`
**File:** `extensions/product-team/test/e2e/mocks/llm-provider.ts:36-40`
**Issue:** The `try/catch` block in `getFixtures` returns `null` on any read/parse failure. A missing or
malformed fixture file goes undetected — the mock falls back to a generic `{ status: 'completed', stage }`
response and the test passes silently, masking broken fixtures.
**Fix:** Remove the try/catch and let `loadFixture` throw. `JSON.parse` / `readFileSync` errors surface
immediately during test setup.

#### S3 — multi-project.test.ts: first test does not assert `metadata.projectId`
**File:** `extensions/product-team/test/e2e/scenarios/multi-project.test.ts:58`
**Issue:** The test "tasks are associated with their project at creation" creates tasks for two projects and
checks that their IDs differ, but never confirms project tagging — `metadata.projectId` is not asserted.
**Fix:** After the ID-inequality check, load each task via `harness.deps.taskRepo.getById` and assert
`metadata.projectId` matches the expected value.
