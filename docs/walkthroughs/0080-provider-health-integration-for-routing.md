# Walkthrough: 0080 -- Provider Health Integration for Routing

## Task Reference

- Task: `docs/tasks/0080-provider-health-integration-for-routing.md`
- Epic: EP10 -- Dynamic Model Routing
- Branch: `feat/provider-health-cache`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/241

---

## Summary

Created a `ProviderHealthCache` class that wraps the existing `checkProvider()` function
with an in-memory cache, background health check loop, rolling latency tracking, and
stale-while-revalidate pattern. The cache provides sub-millisecond access to provider
health state for the upcoming dynamic model resolver (Task 0081). Status change events
are emitted via callback for downstream consumers (alerting, logging).

---

## Context

The `/api/providers/health` endpoint already pings providers on demand via HTTP. However,
the model resolver needs to make routing decisions per-request — it cannot wait 5s per
provider on every LLM call. The health cache sits between the HTTP health checks and the
resolver, providing a fast, always-available view of provider status.

Task 0079 (complexity scorer) was the first building block. This task provides the second
input signal (provider health) that the resolver will consume.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Cache class with injectable `checkFn` | Enables full unit testing without network I/O |
| Stale-while-revalidate instead of blocking refresh | Guarantees the resolver never blocks on a health check |
| DEGRADED status at 80% of timeout | Catches slow providers before they start timing out |
| Rolling average over configurable N samples | Smooths out transient latency spikes |
| Status change via callback, not EventEmitter | Simpler API, no listener leak risk, testable |
| No modification to `provider-health.ts` HTTP handler | Keeps the existing endpoint stable; cache is additive |

---

## Implementation Notes

### Approach

1. Defined types: `ProviderHealthStatus` (HEALTHY/DEGRADED/DOWN), `HealthState`,
   `ProviderHealthCacheConfig`, `HealthStatusChangeEvent`
2. Implemented `ProviderHealthCache` class with `Map<string, HealthState>` storage
3. Background loop via `setInterval` with `start()`/`stop()` lifecycle
4. `getStatus()` checks TTL and triggers async refresh if expired (stale-while-revalidate)
5. `refreshProvider()` handles check errors by setting `connected=false` (last-known-good pattern)
6. Status change detection compares previous vs new status, only emits after first check
7. Integrated cache creation into `index.ts` `register()` with logging on status change

### Key Changes

- `provider-health-cache.ts`: New 200-line module with cache class, types, and defaults
- `provider-health-cache.test.ts`: 31 tests covering TTL, lifecycle, rolling avg, events, errors
- `index.ts`: Added cache instantiation and status change logging in register()

---

## Commands Run

```bash
pnpm test       # 1283 tests pass (89 model-router, 31 new)
pnpm lint       # Clean
pnpm typecheck  # Clean
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/model-router/src/provider-health-cache.ts` | Created | ProviderHealthCache class with TTL, rolling latency, events |
| `extensions/model-router/test/provider-health-cache.test.ts` | Created | 31 tests for cache behavior |
| `extensions/model-router/src/index.ts` | Modified | Integrated cache with status change logging |
| `docs/tasks/0080-provider-health-integration-for-routing.md` | Created | Task spec |
| `docs/walkthroughs/0080-provider-health-integration-for-routing.md` | Created | This walkthrough |
| `docs/roadmap.md` | Modified | Task 0080 status: PENDING → DONE |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| provider-health-cache | 31 | 31 | ~95% |
| model-router total | 89 | 89 | >90% |
| Monorepo total | 1283 | 1283 | N/A |

---

## Follow-ups

- Task 0081 will consume `ProviderHealthCache.getStatus()` in the model resolver
- Consider exposing cache via `/api/providers/health` response (optional enrichment)
- Future: persist health history to SQLite for EP14 observability dashboards

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
