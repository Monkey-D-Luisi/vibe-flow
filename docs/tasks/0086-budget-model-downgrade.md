# Task: 0086 -- Budget-Triggered Model Tier Auto-Downgrade

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP11 -- Budget Intelligence |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-09 |
| Branch | `feat/0086-budget-model-downgrade` |

---

## Goal

Connect the budget engine (Tasks 0084-0085) with the model router (EP10) so that when an agent's budget consumption crosses warning thresholds, the model tier automatically downgrades from premium to standard/economy, preserving budget for critical work.

---

## Context

The cost-aware router (`extensions/model-router/src/cost-aware-router.ts`) already implements downgrade logic via `applyCostAwareTier()`, with thresholds at 50% remaining (force standard) and 20% remaining (force economy). However, `ResolverConfig.budgetRemainingFraction` is always `undefined`, so the downgrade never triggers. The budget engine (Tasks 0084-0085) tracks per-agent consumption and exposes `checkAgentBudget()` returning `consumptionRatio`. This task bridges the two systems.

---

## Scope

### In Scope

- Budget integration module for the model-router extension
- Wiring `budgetRemainingFraction` into the resolver config per-request
- Cross-extension communication via shared state registry
- Tests for the budget integration module

### Out of Scope

- Telegram /budget dashboard (Task 0087)
- Budget forecasting (Task 0088)
- Changes to the cost-aware-router algorithm itself

---

## Requirements

1. Model tier adjusts in real-time based on per-agent budget consumption
2. High-complexity tasks resist downgrade via existing `highComplexityFloor` override
3. Budget query adds < 5ms to resolution time (synchronous SQLite)
4. Cross-extension communication uses a shared state registry pattern
5. >= 90% test coverage for new files

---

## Acceptance Criteria

- [x] AC1: `before_model_resolve` hook queries agent budget and sets `budgetRemainingFraction`
- [x] AC2: Model tier downgrades to standard when budget remaining < 50%
- [x] AC3: Model tier downgrades to economy when budget remaining < 20%
- [x] AC4: Cross-extension budget state registry accessible from model-router
- [x] AC5: Existing cost-aware-router tests continue to pass unchanged
- [x] AC6: >= 90% test coverage for all new files

---

## Constraints

- Must not create a direct import dependency from model-router to product-team
- No breaking changes to existing model-router or product-team APIs
- `index.ts` files must stay under 500 LOC

---

## Implementation Steps

1. Create `extensions/model-router/src/budget-integration.ts` with budget state registry
2. Modify `extensions/model-router/src/index.ts` to query budget state in `before_model_resolve`
3. Modify `extensions/product-team/src/hooks/budget-hooks.ts` to publish budget state after consumption tracking
4. Write tests for budget integration module
5. Run quality gates

---

## Testing Plan

- Unit tests: budget state registry (set, get, clear)
- Unit tests: budget fraction calculation from consumption ratio
- Integration tests: model resolver uses budget state to downgrade tiers
- Contract tests: cross-extension state flow

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 90%)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
