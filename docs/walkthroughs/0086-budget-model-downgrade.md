# Walkthrough: 0086 -- Budget-Triggered Model Tier Auto-Downgrade

## Task Reference

- Task: `docs/tasks/0086-budget-model-downgrade.md`
- Epic: EP11 -- Budget Intelligence
- Branch: `feat/0086-budget-model-downgrade`
- PR: TBD

---

## Summary

Bridges the budget engine (EP11, Tasks 0084-0085) with the cost-aware model router (EP10) via a cross-extension shared state registry on `globalThis`. When an agent's budget consumption crosses warning thresholds, the model tier automatically downgrades from premium to standard/economy, preserving budget for critical work.

---

## Context

The cost-aware router already implements downgrade logic (`applyCostAwareTier`) but `budgetRemainingFraction` was always undefined. The budget engine tracks per-agent consumption via `checkAgentBudget()`. This task bridges them with a cross-extension shared state registry using `Symbol.for('openclaw:budget-state-registry')` on `globalThis`.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| globalThis + Symbol.for registry | Avoids cross-package import dependency between model-router and product-team; both run in same Node.js process |
| Fail-open on missing budget state | Unknown agents get `undefined` fraction, which passes through as no downgrade (safe default) |
| Publisher callback pattern | product-team pushes state after each consumption update; model-router reads synchronously before each resolve |
| Inline publisher in index.ts | Keeps product-team free of model-router dependency; publisher is 4 lines using the same Symbol.for key |

---

## Implementation Notes

- `budget-integration.ts` provides the shared registry API: publish, get, fraction, clear, list
- `model-router/index.ts` injects `budgetRemainingFraction` and `costAwareTierConfig` into `resolverConfig` before each resolve call
- `budget-hooks.ts` accepts optional `BudgetStatePublisher` callback and publishes after tracking
- `product-team/index.ts` creates a globalThis-backed publisher callback and passes it to `registerBudgetHooks`
- The existing `applyCostAwareTier` algorithm is unchanged — thresholds: 50% remaining → standard, 20% → economy
- `Math.max(0, 1.0 - consumptionRatio)` ensures fraction never goes negative

---

## Commands Run

```bash
pnpm typecheck
pnpm lint
pnpm test
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/model-router/src/budget-integration.ts` | Created | Cross-extension budget state registry (globalThis + Symbol.for) |
| `extensions/model-router/src/index.ts` | Modified | Import getBudgetRemainingFraction, inject into resolverConfig per-request |
| `extensions/model-router/test/budget-integration.test.ts` | Created | 20 tests for budget state registry, fraction calculation, cross-extension contract |
| `extensions/product-team/src/hooks/budget-hooks.ts` | Modified | Add BudgetStatePublisher interface, publish state after consumption tracking |
| `extensions/product-team/src/index.ts` | Modified | Create globalThis-backed publisher, pass to registerBudgetHooks |
| `docs/tasks/0086-budget-model-downgrade.md` | Created | Task specification |
| `docs/walkthroughs/0086-budget-model-downgrade.md` | Created | This walkthrough |
| `docs/roadmap.md` | Modified | Task 0086 status → DONE |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| budget-integration.test.ts | 20 | 20 | ~95% |
| cost-aware-router.test.ts (existing) | 36 | 36 | unchanged |
| model-resolver.test.ts (existing) | 34 | 34 | unchanged |
| All model-router | 199 | 199 | - |
| All workspace | 1519 | 1519 | - |

---

## Follow-ups

- Task 0087: Telegram /budget dashboard (EP11)
- Task 0088: Budget forecasting (EP11)
- Consider adding budget state TTL to auto-expire stale entries

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
