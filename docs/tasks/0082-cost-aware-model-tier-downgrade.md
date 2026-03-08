# Task: 0082 -- Cost-Aware Model Tier Downgrade

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP10 -- Dynamic Model Routing |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-08 |
| Branch | `feat/0082-cost-aware-model-tier-downgrade` |

---

## Goal

Integrate cost-aware model tier selection into the dynamic model resolver so that
budget consumption automatically triggers progressive downgrades from premium to
economy tiers, preventing budget exhaustion while keeping critical tasks on
capable models.

---

## Context

Task 0081 activated the `before_model_resolve` hook with a placeholder for budget
integration: a single `budgetRemainingFraction` field on `ResolverConfig` with a
hard-coded `< 0.2` threshold that downgrades by one tier. This is insufficient:

- Only one threshold (20%) with one-step downgrade
- No multi-tier progression (50% → standard, 20% → economy)
- High-complexity tasks get downgraded the same as trivial tasks
- No logging of cost-driven decisions for observability
- Tier names and thresholds are hard-coded, not configurable

This task replaces the placeholder with a proper cost-aware routing module.

---

## Scope

### In Scope

- `CostAwareRouter` module with configurable tier thresholds
- Multi-threshold tier selection (premium/standard/economy)
- High-complexity override: score > 70 resists downgrade by one tier (economy floor)
- Structured logging of all cost-driven downgrade decisions
- Integration into the existing `model-resolver.ts` resolution flow
- Comprehensive test suite with >= 90% coverage

### Out of Scope

- Real-time budget consumption tracking (EP11 Task 0084)
- Per-agent budget enforcement (EP11 Task 0085)
- Telegram `/budget` dashboard (EP11 Task 0087)
- Budget forecasting (EP11 Task 0088)

---

## Requirements

1. Tier boundaries must be configurable via `CostAwareTierConfig`
2. Default thresholds: premium > 50%, standard 20-50%, economy < 20%
3. High-complexity tasks (score > 70) resist downgrade by one tier
4. Economy is the absolute floor — no task goes below economy
5. Every cost-driven decision is logged with budget snapshot
6. The module is pure (no DB/network calls) — budget fraction is injected

---

## Acceptance Criteria

- [x] AC1: Tier thresholds are configurable via `CostAwareTierConfig`
- [x] AC2: Premium tasks downgrade to standard when budget 20-50%
- [x] AC3: All tasks downgrade to economy when budget < 20%
- [x] AC4: High-complexity tasks (score > 70) resist one level of downgrade
- [x] AC5: Downgrade decisions include budget snapshot in structured log
- [x] AC6: >= 90% test coverage on cost-aware-router module
- [x] AC7: Integration with model-resolver replaces the placeholder logic

---

## Constraints

- Must follow existing model-router patterns (pure functions, factory/closure, strict TS)
- Must not break existing model-resolver tests
- Must use ESM imports with `.js` extensions
- No `any` types

---

## Implementation Steps

1. Create `cost-aware-router.ts` with `CostAwareTierConfig` and `applyCostAwareTier()` function
2. Create `cost-aware-router.test.ts` with comprehensive tier threshold tests
3. Modify `model-resolver.ts` to use `applyCostAwareTier()` instead of inline placeholder
4. Update `model-resolver.ts` types to accept `CostAwareTierConfig`
5. Run quality checks

---

## Testing Plan

- Unit tests: All tier boundary transitions, high-complexity override, edge cases (0%, 100%, exact boundary values)
- Integration: Verify model-resolver tests still pass with new cost-aware logic
- Contract: Config shape validation

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 90%)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [x] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
