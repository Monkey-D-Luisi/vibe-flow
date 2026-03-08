# Task: 0080 -- Provider Health Integration for Routing

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP10 -- Dynamic Model Routing |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-08 |
| Branch | `feat/provider-health-cache` |

---

## Goal

Extend the existing provider health check system with an in-memory cache, background
refresh loop, latency tracking, and event emission so the dynamic model resolver can
make routing decisions based on real-time provider health without blocking on HTTP probes.

---

## Context

The `/api/providers/health` endpoint (in `provider-health.ts`) pings providers on demand
and returns human-readable status. It does not cache results or expose them programmatically
to other modules. The model resolver (Task 0081) will need sub-millisecond access to
provider health state — it cannot wait 5 seconds per provider on every LLM request.

Prior work:
- Task 0079 created the complexity scorer (pure function, no side effects)
- `provider-health.ts` already has `checkProvider()` and the `PROVIDERS` array
- The model-router `index.ts` registers the health route but does no caching

---

## Scope

### In Scope

- `ProviderHealthCache` class with configurable TTL (default 60s)
- Background health check loop (configurable interval, default 120s)
- Health status enum: `HEALTHY | DEGRADED | DOWN`
- Latency tracking per provider (rolling average over last 10 checks)
- Event emission on status change (for alerting integration)
- Stale-while-revalidate pattern on TTL expiry

### Out of Scope

- Modifying the HTTP handler in `provider-health.ts` (that stays as-is)
- Integrating with the model resolver (that's Task 0081)
- Budget-aware routing (that's Task 0082)

---

## Requirements

1. `ProviderHealthCache` is a class with `getStatus(providerId)` and `getAllStatuses()` methods
2. Background loop runs health checks at configurable interval without blocking main thread
3. Cache returns last-known-good status when provider check fails or times out
4. TTL expiry triggers async refresh (non-blocking stale-while-revalidate)
5. Status change emits an event via callback for downstream consumers
6. Rolling average latency computed over the last N checks (configurable, default 10)
7. `start()` / `stop()` lifecycle methods for the background loop

---

## Acceptance Criteria

- [x] AC1: `ProviderHealthCache` caches provider status with configurable TTL
- [x] AC2: Background loop refreshes health at configurable interval
- [x] AC3: `getStatus()` returns last-known-good when provider is unreachable
- [x] AC4: TTL expiry triggers async refresh (stale-while-revalidate)
- [x] AC5: Status change emits event via callback
- [x] AC6: Rolling average latency tracked per provider
- [x] AC7: >= 90% test coverage including TTL expiry and status transitions

---

## Constraints

- Must not modify the existing `provider-health.ts` HTTP handler
- Must be injectable with a custom `checkProvider` function for testing
- No external dependencies beyond Node.js built-ins
- Must follow existing ESM + strict TypeScript patterns

---

## Implementation Steps

1. Define types: `ProviderHealthStatus`, `HealthState`, `ProviderHealthCacheConfig`
2. Implement `ProviderHealthCache` class with in-memory Map storage
3. Add rolling average latency tracker
4. Add background refresh loop with `setInterval`
5. Add stale-while-revalidate on `getStatus()` when TTL expired
6. Add status change detection and event emission
7. Write comprehensive tests (TTL, transitions, rolling avg, lifecycle)
8. Integrate cache creation into `index.ts` `register()` method

---

## Testing Plan

- Unit tests: Cache get/set, TTL expiry, status transitions, rolling average math
- Integration tests: Background loop lifecycle (start/stop), event emission
- Edge cases: All providers down, unknown provider ID, zero-length history

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 90%)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [ ] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
