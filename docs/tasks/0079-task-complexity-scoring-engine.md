# Task: 0079 -- Task Complexity Scoring Engine

## Metadata

| Field | Value |
|-------|-------|
| Status | PENDING |
| Epic | [EP10 -- Dynamic Model Routing](../backlog/EP10-dynamic-model-routing.md) |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-08 |
| Branch | `feat/task-complexity-scoring-engine` |

---

## Goal

Create a pure scoring function that evaluates task complexity from available
metadata and produces a numeric score (0-100) used by the model resolver to
route LLM requests to the appropriate model tier.

---

## Context

The model-router extension has a commented-out `before_model_resolve` hook
reserved for dynamic routing. This task creates the scoring engine that feeds
that hook. Pipeline metadata (scope, stage, durations) is already captured in
`TaskRecord.metadata` by `pipeline-advance.ts`.

---

## Scope

### In Scope

- `ComplexityScore` type with score, tier, and factors
- `ComplexityConfig` type with configurable weights
- `scoreComplexity()` pure function
- Comprehensive test suite

### Out of Scope

- Hook activation (Task 0081)
- Provider health integration (Task 0080)
- Budget-aware routing (Task 0082)

---

## Requirements

1. Score function is pure (no side effects, no DB access, no I/O)
2. All scoring factors configurable via a config object
3. Score clamped to 0-100 range
4. Tier derived from score: low (0-33), medium (34-66), high (67-100)
5. Factors array documents which inputs contributed to the final score
6. Deterministic for identical inputs

---

## Acceptance Criteria

- [ ] AC1: `scoreComplexity()` returns a `ComplexityScore` with score, tier, and factors
- [ ] AC2: Score is clamped to [0, 100] regardless of extreme inputs
- [ ] AC3: All scoring weights are overridable via `ComplexityConfig`
- [ ] AC4: Missing metadata fields are handled gracefully (default to neutral score)
- [ ] AC5: >= 90% test coverage for complexity-scorer module
- [ ] AC6: Function is pure — no side effects verified in tests

---

## Constraints

- Must use existing `PipelineStage` / `STAGE_OWNERS` vocabulary from product-team
- Must not import from product-team (model-router is independent) — duplicate minimal types
- TypeScript strict mode, no `any`
- ESM with `.js` extensions

---

## Implementation Steps

1. Define types: `ComplexityInput`, `ComplexityConfig`, `ComplexityScore`, `Factor`
2. Implement scoring algorithm with configurable weights
3. Add tier derivation from score
4. Add clamping and edge case handling
5. Write tests (TDD: red-green-refactor)

---

## Testing Plan

- Unit tests: every scoring dimension in isolation (scope, stage, role, history)
- Edge cases: missing fields, all-zero config, extreme values, unknown stages
- Determinism: same input produces same output across 100 runs
- Purity: no mutations, no I/O calls

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Tests written and passing
- [ ] Coverage meets threshold (>= 90%)
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
- [ ] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md)
- [Coding Standards](../../.agent/rules/coding-standards.md)
- [Testing Standards](../../.agent/rules/testing-standards.md)
- [EP10 Backlog](../backlog/EP10-dynamic-model-routing.md)
