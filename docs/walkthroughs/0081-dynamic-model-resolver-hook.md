# Walkthrough: 0081 -- Dynamic Model Resolver Hook

## Task Reference

- Task: `docs/tasks/0081-dynamic-model-resolver-hook.md`
- Epic: EP10 -- Dynamic Model Routing
- Branch: `feat/0081-dynamic-model-resolver-hook`
- PR: _pending_

---

## Summary

Implemented the `before_model_resolve` hook in the model-router extension. The new `model-resolver.ts` module combines complexity scoring (Task 0079) and provider health (Task 0080) to dynamically select the optimal model for each LLM request. The hook is config-gated via `pluginConfig.dynamicRouting.enabled` and falls back to static routing on any error.

---

## Context

Tasks 0079 and 0080 delivered the complexity scorer and provider health cache respectively. The `before_model_resolve` hook in the model-router plugin was commented out. This task implements the `resolveModel()` function that combines complexity scores, provider health, and optional budget data to dynamically select the optimal model per-request, and activates the hook with config-gated enablement.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Factory pattern (`createModelResolver`) over class | Returns a closure bound to health cache and config, keeping the per-request path minimal and testable |
| Optimistic health for unchecked providers | If a provider has never been checked (e.g. on startup), treat it as usable to avoid cold-start routing failures |
| Tier search order: desired → remaining in precedence | Ensures graceful degradation when the desired tier is unavailable while still preferring higher tiers |
| Agent model preference: primary → fallbacks → catalog | Respects the agent's configured model preferences before falling back to any catalog model at the target tier |
| Budget downgrade as a placeholder (fraction interface) | EP11 Task 0082 will implement full budget integration; for now, the resolver accepts an optional budget fraction to enable the downgrade path |
| Use `api.pluginConfig` for dynamic routing config | SDK exposes `api.pluginConfig` for plugin-specific config, not a `getConfig()` method |
| Return `modelOverride`/`providerOverride` per SDK types | The `PluginHookBeforeModelResolveResult` uses `modelOverride` and `providerOverride` field names |

---

## Implementation Notes

### Approach

1. Explored existing codebase: complexity scorer types, health cache interface, OpenClaw SDK hook signature
2. Created `model-resolver.ts` with the resolution algorithm: score complexity → map tier → check health → pick model
3. Created comprehensive test suite (31 tests) covering all ACs
4. Updated `index.ts` to activate the hook when `pluginConfig.dynamicRouting.enabled === true`
5. Updated `openclaw.plugin.json` config schema with `dynamicRouting.enabled` property
6. Fixed type errors against SDK hook contract (`PluginHookBeforeModelResolveEvent`, `PluginHookAgentContext`)

### Key Changes

- **`model-resolver.ts`**: Core resolution logic with `createModelResolver()` factory, tier search, health checks, structured logging, and static fallback
- **`index.ts`**: Activated `before_model_resolve` hook, reads `pluginConfig.dynamicRouting.enabled`, builds model catalog from agent config, wires resolver to hook
- **`openclaw.plugin.json`**: Added `dynamicRouting` config property with `enabled` boolean

---

## Commands Run

```bash
pnpm test       # 120 passed (31 new)
pnpm lint       # Clean
pnpm typecheck  # Clean
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/model-router/src/model-resolver.ts` | Created | Model resolver with complexity + health routing |
| `extensions/model-router/test/model-resolver.test.ts` | Created | 31 tests covering all ACs |
| `extensions/model-router/src/index.ts` | Modified | Activated `before_model_resolve` hook with config gating |
| `extensions/model-router/openclaw.plugin.json` | Modified | Added `dynamicRouting.enabled` config property |
| `docs/tasks/0081-dynamic-model-resolver-hook.md` | Created | Task specification |
| `docs/walkthroughs/0081-dynamic-model-resolver-hook.md` | Created | This walkthrough |
| `docs/roadmap.md` | Modified | Task 0081 status updated, Task 0080 status fixed |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| model-resolver | 31 | 31 | >= 90% |
| complexity-scorer | 50 | 50 | (unchanged) |
| provider-health | 8 | 8 | (unchanged) |
| provider-health-cache | 31 | 31 | (unchanged) |
| **Total (model-router)** | **120** | **120** | |

---

## Follow-ups

- Task 0082: Cost-Aware Model Tier Downgrade — integrate with budget tracking, refine the `budgetRemainingFraction` placeholder
- Task 0083: Fallback Chain with Copilot-Proxy Resolution — extend resolver with ordered fallback chain and capability annotations
- The `buildModelCatalog` heuristic classifies models by prefix regex — a future task could use provider metadata for more accurate classification

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
