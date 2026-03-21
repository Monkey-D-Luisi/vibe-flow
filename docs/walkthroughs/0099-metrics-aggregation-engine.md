# Walkthrough: 0099 -- Metrics Aggregation Engine (SQLite)

## Task Reference

- Task: `docs/tasks/0099-metrics-aggregation-engine.md`
- Epic: EP14 -- Local-First Observability
- Branch: `feat/EP14-local-first-observability`
- PR: #262

---

## Summary

Built a SQLite-backed metrics aggregation engine that transforms raw event_log entries into pre-computed queryable metrics. The engine runs on a cron schedule (hourly every 5 min, daily every 60 min) and provides an on-demand `metrics.refresh` tool. Metrics are stored in a new `metrics_aggregated` table created by migration v6.

---

## Context

The event_log table stores all agent activity as structured JSON events. EP09 added pipeline stage events and per-stage metrics. EP11 added budget records. This task builds the aggregation layer that transforms raw events into queryable metrics.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Pure SQL aggregation (no JS scan) | Performance: SQL GROUP BY is faster than loading all events into JS memory |
| Upsert via INSERT OR REPLACE | Idempotent: re-running aggregation produces the same result |
| Separate hourly/daily cron intervals | Hourly metrics need frequent refresh; daily can be less frequent |
| Optional metricsAggregator in tool deps | Graceful degradation: if observability setup fails, other tools still work |

---

## Implementation Notes

### Approach

TDD Red-Green-Refactor. Tests written first for:
1. MetricsRepository CRUD (upsert, query by type/scope/period)
2. MetricsAggregator computation (5 metric types via SQL)
3. Cron lifecycle (start/stop interval timers)
4. metrics.refresh tool (param validation, aggregation trigger)

### Key Changes

- **Migration v6**: Added `metrics_aggregated` table with composite unique index on (metric_type, scope, period)
- **MetricsRepository**: SQLite repository with `upsert()`, `queryByType()`, `queryByScope()`, `deleteOlderThan()`
- **MetricsAggregator**: Computes 5 metric types (agent_activity, event_count, pipeline_throughput, cost_summary, stage_duration) using pure SQL GROUP BY queries against event_log
- **Cron scheduling**: `startCron()` sets up two `setInterval` timers; `stopCron()` clears them
- **metrics.refresh tool**: Registered via `getAllToolDefs()` when `metricsAggregator` is present in deps

---

## Commands Run

```bash
pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/persistence/migrations.ts` | Modified | Added migration v6 for metrics_aggregated table |
| `extensions/product-team/src/observability/metrics-types.ts` | Created | Domain types + TypeBox schema for metrics |
| `extensions/product-team/src/observability/metrics-repository.ts` | Created | SQLite repository for aggregated metrics |
| `extensions/product-team/src/observability/metrics-aggregator.ts` | Created | SQL-based aggregation engine + cron |
| `extensions/product-team/src/observability/metrics-refresh-tool.ts` | Created | metrics.refresh tool definition |
| `extensions/product-team/src/observability/registration.ts` | Created | setupObservability() wiring function |
| `extensions/product-team/src/tools/index.ts` | Modified | Added optional metricsAggregator dep |
| `extensions/product-team/src/index.ts` | Modified | Wired observability setup and cron |
| `extensions/product-team/test/observability/metrics-repository.test.ts` | Created | 8 tests for repository CRUD |
| `extensions/product-team/test/observability/metrics-aggregator.test.ts` | Created | 12 tests for aggregation + cron |
| `extensions/product-team/test/observability/metrics-refresh-tool.test.ts` | Created | 5 tests for tool behavior |
| `extensions/product-team/test/persistence/connection.test.ts` | Modified | Updated migration count expectation |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| metrics-repository.test.ts | 8 | 8 | >90% |
| metrics-aggregator.test.ts | 12 | 12 | >90% |
| metrics-refresh-tool.test.ts | 5 | 5 | >90% |

---

## Follow-ups

- Incremental aggregation (only process events since last run) — deferred to future optimization
- Aggregation window alignment to clock boundaries — tracked as CR finding

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
