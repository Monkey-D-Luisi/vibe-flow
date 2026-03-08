# Task: 0083 -- Fallback Chain with Copilot-Proxy Resolution

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP10 -- Dynamic Model Routing |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-08 |
| Branch | `feat/0083-fallback-chain-copilot-proxy` |

---

## Goal

Implement ordered fallback chain resolution that tries each configured fallback
model in order, with special handling for copilot-proxy (GitHub Copilot free-tier)
as the ultimate fallback when all named fallbacks are exhausted.

---

## Context

Tasks 0079-0082 built the dynamic model resolver: complexity scoring, provider
health cache, the `before_model_resolve` hook, and cost-aware tier downgrade.
The current `findHealthyModel()` in `model-resolver.ts` searches by tier
precedence (desired → adjacent) but does not follow the agent's configured
fallback order or inject copilot-proxy as a last resort.

When all named providers are DOWN, the resolver falls through to `staticFallback()`
which returns the agent's primary model regardless of health — the runtime gets a
model ID with zero guarantee it will work.

---

## Scope

### In Scope

- Ordered fallback chain resolution following `agents.list[agentId].model.fallbacks`
- Copilot-proxy as ultimate fallback when all named fallbacks exhausted
- `fallbackLevel` annotation on `ResolveResult` for downstream capability awareness
- Full resolution chain logging (attempted candidates and skip reasons)
- Integration into `model-resolver.ts` replacing current tier-only search

### Out of Scope

- Capability-based prompt simplification (downstream consumer responsibility)
- Auth profile management for copilot-proxy (already exists)
- Budget-triggered fallback (already handled by cost-aware-router)

---

## Requirements

1. Fallback chain tries models in agent-configured order, not tier order
2. Within each candidate, provider health determines usability (DOWN = skip)
3. When all named fallbacks exhausted, inject copilot-proxy models as last resort
4. Annotate result with `fallbackLevel: 'copilot-proxy'` when copilot-proxy is selected as a non-configured fallback
5. Log every candidate attempted and why it was skipped
6. Total failover must complete in < 30s (including health cache reads)
7. Pure function with no side effects (reads health cache, does not mutate)

---

## Acceptance Criteria

- [x] AC1: Fallback chain follows agent-configured fallback order
- [x] AC2: Copilot-proxy injected as ultimate fallback when not in agent config
- [x] AC3: `fallbackLevel` annotation present on copilot-proxy resolution
- [x] AC4: Full resolution chain logged with skip reasons
- [x] AC5: All-providers-DOWN scenario returns structured error (not silent static fallback)
- [x] AC6: >= 90% test coverage
- [x] AC7: Integration with model-resolver.ts replaces current tier-only findHealthyModel

---

## Constraints

- No breaking changes to existing `ResolveResult` shape (additive only)
- Must work with existing `ProviderHealthCache` interface
- Copilot-proxy provider ID defaults to `github-copilot` (configurable via `FallbackChainConfig.copilotProxyProviderId`)
- No network calls — reads only from in-memory health cache

---

## Implementation Steps

1. Create `fallback-chain.ts` with `resolveFallbackChain()` pure function
2. Define `FallbackChainResult` and `FallbackAttempt` types
3. Implement ordered resolution: primary → configured fallbacks → copilot-proxy
4. Add `fallbackLevel` field to `ResolveResult` type
5. Replace `findHealthyModel()` call in `model-resolver.ts` with `resolveFallbackChain()`
6. Update `logResolution()` to include chain details
7. Create comprehensive tests in `fallback-chain.test.ts`
8. Update existing `model-resolver.test.ts` for new integration

---

## Testing Plan

- Unit tests: All fallback chain scenarios (happy path, partial DOWN, all DOWN, copilot-proxy injection, already-configured copilot-proxy)
- Integration tests: Full resolver flow with fallback chain active
- Contract tests: ResolveResult shape backward compatibility

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 80% major / >= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] Code reviewed (if applicable)
- [x] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
