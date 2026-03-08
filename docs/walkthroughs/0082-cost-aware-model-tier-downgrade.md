# Walkthrough: 0082 -- Cost-Aware Model Tier Downgrade

## Task Reference

- Task: `docs/tasks/0082-cost-aware-model-tier-downgrade.md`
- Epic: EP10 -- Dynamic Model Routing
- Branch: `feat/0082-cost-aware-model-tier-downgrade`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/246

---

## Summary

Replaced the single-threshold budget downgrade placeholder in `model-resolver.ts`
with a proper multi-threshold cost-aware routing module. The new `cost-aware-router.ts`
supports configurable tier boundaries (premium >= 50%, standard 20-49.9%, economy < 20%),
a high-complexity override that resists downgrade by one tier for critical tasks,
and structured logging of all cost-driven decisions with budget snapshots.

---

## Context

Task 0081 activated the `before_model_resolve` hook with a placeholder budget
integration: a single `budgetRemainingFraction < 0.2` check that called
`downgradeTier()` for a one-step downgrade. This was insufficient for real
budget management:

- Only one threshold (20%) with one-step downgrade
- No multi-tier progression (50% → standard, 20% → economy)
- High-complexity tasks downgraded the same as trivial tasks
- No structured logging of cost decisions
- Thresholds were hard-coded

The model-resolver already had the `budgetRemainingFraction` field on
`ResolverConfig` and the `downgradeTier()` helper. This task replaces that
logic with a dedicated module.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Separate `cost-aware-router.ts` module | Keeps concerns isolated; the cost-aware logic is independently testable and configurable without touching the resolver core |
| Pure function with injected budget fraction | No DB/network calls in the hot path; budget state comes from caller, enabling both static config and future dynamic budget services |
| High-complexity override upgrades by one tier (not two) | Conservative protection — critical tasks get one tier better than budget allows, but not unlimited. Prevents budget exhaustion from override abuse |
| Kept `budgetRemainingFraction` on `ResolverConfig` | Backward-compatible with existing config; added optional `costAwareTierConfig` for the new thresholds |
| `CostAwareTierResult` attached to `ResolveResult` | Enables structured logging and downstream observability of cost-driven decisions |

---

## Implementation Notes

### Approach

1. Created `cost-aware-router.ts` with `applyCostAwareTier()` pure function
2. Created comprehensive test suite (35 tests) covering all tier boundaries,
   high-complexity override, edge cases, custom config, and purity
3. Modified `model-resolver.ts` to import and use the new module, replacing
   the inline placeholder
4. Extended `ResolveResult` with optional `costAwareTier` field for logging
5. Updated `logResolution()` to include budget info when available
6. Removed unused `downgradeTier()` function from model-resolver

### Key Changes

**New `applyCostAwareTier()` algorithm:**
1. If no budget fraction → pass through desired tier unchanged
2. Clamp budget fraction to [0, 1]
3. Determine maximum tier allowed by budget thresholds
4. If desired tier within budget → no downgrade
5. Otherwise downgrade to budget-allowed tier
6. If complexity > `highComplexityFloor` → upgrade one tier (capped at desired)

**Model resolver integration:**
- The old `if (fraction < 0.2) downgradeTier(desiredTier)` is replaced with
  `applyCostAwareTier({ desiredTier, budgetRemainingFraction, complexityScore })`
- The result includes `costAwareTier` when budget tracking is active
- Log messages now include `budget=X% downgraded=bool override=bool`

---

## Commands Run

```bash
pnpm test          # 156 model-router tests passed (including 35 new)
pnpm lint          # Clean across all 7 workspace packages
pnpm typecheck     # Clean across all 7 workspace packages
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/model-router/src/cost-aware-router.ts` | Created | Multi-threshold cost-aware tier selection module with configurable thresholds and high-complexity override |
| `extensions/model-router/test/cost-aware-router.test.ts` | Created | 35 tests covering all tier boundaries, override logic, edge cases, custom config, purity |
| `extensions/model-router/src/model-resolver.ts` | Modified | Replaced placeholder budget downgrade with `applyCostAwareTier()`, added `CostAwareTierResult` to `ResolveResult`, enhanced logging, removed unused `downgradeTier()` |
| `docs/roadmap.md` | Modified | Task 0082 status: PENDING → IN_PROGRESS → DONE |
| `docs/tasks/0082-cost-aware-model-tier-downgrade.md` | Created | Task specification |
| `docs/walkthroughs/0082-cost-aware-model-tier-downgrade.md` | Created | This walkthrough |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| cost-aware-router | 35 | 35 | ~95% |
| model-resolver (existing) | 32 | 32 | maintained |
| model-router total | 156 | 156 | maintained |

---

## Follow-ups

- EP11 Task 0084 will provide real-time budget data to populate `budgetRemainingFraction` dynamically instead of static config
- EP11 Task 0086 will build on this module for budget-triggered auto-downgrade with Telegram notifications
- Consider adding per-model cost weights to `ModelCandidate` for cost-optimal selection within a tier

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
