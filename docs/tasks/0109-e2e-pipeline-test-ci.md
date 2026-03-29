# Task: 0109 -- E2E Pipeline Test with LLM Mocks in CI

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP16 -- E2E Testing & Load Characterization |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-29 |
| Branch | `feat/EP16-e2e-testing-load` |

---

## Goal

Wire the existing e2e test suite into CI and extend coverage to validate
the full 10-stage pipeline (IDEA → DONE) with mocked LLM responses,
quality gate evaluation, and decision engine invocation on every PR.

---

## Context

The product-team extension already has 7 e2e scenario tests, an LLM mock
fixture system, and a pipeline harness with in-memory SQLite. These tests
run locally but are not part of the CI quality gate workflow. The `test:e2e`
script exists but is not invoked in `.github/workflows/quality-gate.yml`.

---

## Scope

### In Scope

- Add `e2e-pipeline` job to CI workflow
- Extend happy-path e2e test with quality gate evaluation
- Add quality gate evaluation assertion helper
- Ensure clear error messages with stage name and agent on failure
- CI job timeout: 5 minutes, merge-blocking

### Out of Scope

- Load testing (Task 0110)
- Protocol stress testing (Task 0111)
- New LLM mock fixtures beyond what already exists

---

## Requirements

1. Full 10-stage pipeline completes with mocked LLM responses in CI
2. CI job completes in < 5 minutes
3. Failure in any stage produces clear error with stage name and agent
4. Quality gates evaluated during pipeline (with mock quality data)
5. Decision engine invoked at least once during pipeline
6. E2E test job is a required status check blocking merge

---

## Acceptance Criteria

- [ ] AC1: E2E pipeline test validates all 10 stages IDEA → DONE
- [ ] AC2: Quality gate evaluation tested with mock quality data
- [ ] AC3: Decision engine exercised during pipeline
- [ ] AC4: CI workflow has dedicated e2e-pipeline job
- [ ] AC5: E2E job configured as merge-blocking with 5-min timeout
- [ ] AC6: `pnpm test && pnpm lint && pnpm typecheck` passes

---

## Constraints

- Use existing LLM mock fixtures and pipeline harness
- ESM, strict TypeScript, no `any`
- CI job runs after unit tests to fail fast

---

## Testing Plan

1. Run `pnpm test:e2e` locally — all scenarios pass
2. Verify new quality-gate-in-pipeline test passes
3. Verify CI workflow YAML is valid
4. `pnpm test && pnpm lint && pnpm typecheck` — zero errors

---

## Definition of Done

- [ ] E2E tests run in CI on every PR
- [ ] Quality gate evaluation tested in pipeline
- [ ] Decision engine invoked during e2e
- [ ] CI job is merge-blocking, < 5 min timeout
- [ ] All quality gates pass locally
