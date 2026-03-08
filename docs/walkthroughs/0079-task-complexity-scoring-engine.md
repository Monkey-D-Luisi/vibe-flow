# Walkthrough: 0079 -- Task Complexity Scoring Engine

## Task Reference

- Task: `docs/tasks/0079-task-complexity-scoring-engine.md`
- Epic: EP10 -- Dynamic Model Routing
- Branch: `feat/task-complexity-scoring-engine`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/240

---

## Summary

Implemented a pure task complexity scoring engine in the model-router extension.
The function evaluates task metadata (scope, pipeline stage, agent role,
historical duration, files changed) and produces a 0-100 score with a
low/medium/high tier classification. All scoring weights are configurable and
the function has zero side effects.

---

## Context

The model-router extension had a commented-out `before_model_resolve` hook
reserved for dynamic routing. This task creates the first building block:
a scoring function that quantifies task complexity. This score will be
consumed by the model resolver (Task 0081) to route simple tasks to cheap
models and complex tasks to premium models.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Pure function with no DB access | The scorer must be usable in the `before_model_resolve` hot path with zero latency penalty. Historical data is passed in via input, not queried. |
| Duplicate minimal types from product-team | Model-router must remain independent — no cross-extension imports. Types like `PipelineStage` are duplicated as string unions. |
| Rule-based scoring, not ML | Budget constraints and simplicity. Rules are transparent, debuggable, and configurable. |
| Zero-factor suppression | Factors with 0 points (e.g., designer role modifier) are not included in the factors array to keep output clean. |
| Clamp to [0, 100] | Extreme combinations (e.g., patch + IDEA + pm) can produce negative raw scores. Clamping ensures the tier derivation always works on a valid range. |

---

## Implementation Notes

### Approach

TDD: wrote 50 tests first covering all scoring dimensions, edge cases,
clamping, tier boundaries, configurability, determinism, and purity. Then
implemented the scorer to pass all tests. No refactoring cycle needed —
the implementation was straightforward.

### Key Changes

1. **`complexity-scorer.ts`**: New module with types (`ComplexityInput`,
   `ComplexityConfig`, `ComplexityScore`, `Factor`) and the `scoreComplexity()`
   function. Five scoring dimensions: scope base, stage modifier, role modifier,
   historical duration overrun, files changed. All weights configurable via
   `ComplexityConfig` with sensible defaults in `DEFAULT_CONFIG`.

2. **`complexity-scorer.test.ts`**: 50 tests organized in 11 describe blocks:
   basic behavior, scope scoring, stage modifiers, role modifiers, historical
   duration overrun, files changed, clamping, tier derivation, custom
   configuration, combined scoring, factors documentation, purity verification.

---

## Commands Run

```bash
cd extensions/model-router && npx vitest run --reporter=verbose
cd extensions/model-router && npx vitest run --coverage
pnpm test    # 892 tests pass
pnpm lint    # zero errors
pnpm typecheck  # zero errors
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/model-router/src/complexity-scorer.ts` | Created | Scoring engine: types, defaults, `scoreComplexity()` |
| `extensions/model-router/test/complexity-scorer.test.ts` | Created | 50 tests covering all dimensions, edge cases, purity |
| `docs/tasks/0079-task-complexity-scoring-engine.md` | Created | Task specification |
| `docs/walkthroughs/0079-task-complexity-scoring-engine.md` | Created | This walkthrough |
| `docs/roadmap.md` | Modified | Task 0079 status: PENDING → IN_PROGRESS → DONE |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| complexity-scorer | 50 | 50 | 100% statements, 100% lines, 100% functions, 94.28% branches |
| provider-health (pre-existing) | 8 | 8 | pre-existing coverage |
| Total (model-router) | 58 | 58 | complexity-scorer: 100% |

---

## Follow-ups

- Task 0080: Provider health cache integration (consumes health data for routing)
- Task 0081: Wire `scoreComplexity()` into `before_model_resolve` hook
- Task 0082: Cost-aware tier downgrade reads budget + score
- The 94.28% branch on line 165 is a deep defensive fallback (`?? 20`) for when `config.scopeScores['minor']` is undefined — acceptable

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
