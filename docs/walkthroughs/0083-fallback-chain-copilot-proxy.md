# Walkthrough: 0083 -- Fallback Chain with Copilot-Proxy Resolution

## Task Reference

- Task: `docs/tasks/0083-fallback-chain-copilot-proxy.md`
- Epic: EP10 -- Dynamic Model Routing
- Branch: `feat/0083-fallback-chain-copilot-proxy`
- PR: #247

---

## Summary

Implemented ordered fallback chain resolution that replaces the previous
tier-based `findHealthyModel()` approach with an agent-config-ordered chain.
The resolver now tries each model in the agent's declared order (primary →
configured fallbacks → copilot-proxy injection) and selects the first healthy
candidate. Copilot-proxy models from the catalog are automatically injected
as ultimate fallbacks when all named candidates are exhausted.

---

## Context

Tasks 0079-0082 built the dynamic model resolver with complexity scoring,
provider health cache, the `before_model_resolve` hook, and cost-aware tier
downgrade. The old `findHealthyModel()` searched by tier precedence (desired →
adjacent) which ignored the agent's configured fallback order. When all providers
were DOWN, it fell through to `staticFallback()` which returned the primary model
regardless of health with no diagnostic information.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Agent config order over tier order | The agent's fallbacks are explicitly configured by the operator; respecting their order is more predictable than tier-based heuristics |
| Copilot-proxy injection as separate phase | Separating "configured fallbacks" from "injected copilot-proxy" allows the `fallbackLevel` annotation to distinguish between intentional and emergency fallbacks |
| `FallbackLevel` as union type | Three levels (`primary`, `configured-fallback`, `copilot-proxy`) give downstream consumers enough context to adjust behavior (e.g., simpler prompts for copilot-proxy) |
| Full chain logging in result | Including every attempted candidate and its skip reason enables debugging without re-running the resolution |
| Pure function in separate module | `fallback-chain.ts` has zero side effects and zero imports beyond types, making it easy to test and reason about |

---

## Implementation Notes

### Approach

Created `fallback-chain.ts` as a pure function module with `resolveFallbackChain()`.
The function takes the health cache, model catalog, and agent model config, and
returns a `FallbackChainResult` with the selected model, fallback level, and full
chain of attempts.

Integrated into `model-resolver.ts` by replacing the `findHealthyModel()` call
(step 5 in the resolver) with `resolveFallbackChain()`. Removed the now-unused
`findHealthyModel()`, `isProviderUsable()`, `FoundModel` interface, and `TIER_ORDER`
constant from model-resolver.ts.

Added `fallbackLevel` and `fallbackChain` fields to `ResolveResult` (additive, no
breaking changes). Updated `logResolution()` to include chain details in structured
log output.

### Key Changes

- **New `fallback-chain.ts`**: Pure function with ordered resolution logic. Tries
  primary → configured fallbacks → copilot-proxy models not already attempted.
- **Modified `model-resolver.ts`**: Replaced tier-based search with fallback chain.
  Added `fallbackLevel`, `fallbackChain` to `ResolveResult`. Added `fallbackChainConfig`
  to `ResolverConfig`. Updated log format.
- **Behavioral change**: Model selection now follows agent config order instead of
  tier precedence. The complexity tier and cost-aware tier are still calculated for
  downstream consumers but no longer determine which model is selected.

---

## Commands Run

```bash
pnpm typecheck   # Clean
pnpm lint         # Clean after fixing unused import
pnpm test         # 179 tests passing (20 new fallback-chain tests)
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/model-router/src/fallback-chain.ts` | Created | Ordered fallback chain resolution with copilot-proxy injection |
| `extensions/model-router/test/fallback-chain.test.ts` | Created | 20 tests covering all fallback scenarios |
| `extensions/model-router/src/model-resolver.ts` | Modified | Replaced findHealthyModel with resolveFallbackChain; added fallbackLevel/fallbackChain to ResolveResult |
| `extensions/model-router/test/model-resolver.test.ts` | Modified | Updated 8 tests for new fallback chain behavior; added 3 new integration tests |
| `docs/tasks/0083-fallback-chain-copilot-proxy.md` | Created | Task spec |
| `docs/walkthroughs/0083-fallback-chain-copilot-proxy.md` | Created | This walkthrough |
| `docs/roadmap.md` | Modified | Task 0083 status PENDING → IN_PROGRESS → DONE; fixed Task 0082 status discrepancy |
| `.agent/rules/code-review-workflow.md` | Modified | Added Docker deploy step before manual smoke testing |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| fallback-chain | 20 | 20 | ~95% |
| model-resolver | 34 | 34 | ~90% |
| Total (model-router) | 179 | 179 | >80% |

---

## Follow-ups

- EP11 (Budget Intelligence) should use `fallbackLevel: 'copilot-proxy'` to track budget savings from copilot-proxy usage
- Downstream prompt simplification for copilot-proxy models (EP13 or separate task)
- The complexity tier is now computed but not used for model selection -- potential to re-integrate as a secondary sorting criterion within the agent config order

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
