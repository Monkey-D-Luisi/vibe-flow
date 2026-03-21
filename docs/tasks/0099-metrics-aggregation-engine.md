# Task: 0099 -- Metrics Aggregation Engine (SQLite)

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP14 -- Local-First Observability |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-21 |
| Branch | `feat/EP14-local-first-observability` |

---

## Goal

Build an aggregation layer over the event log that computes and caches key metrics in SQLite, making them queryable in milliseconds instead of requiring full table scans.

---

## Context

The event log (SQLite) captures everything -- stage transitions, decisions, token costs, quality gate results. But there is no aggregation layer. Querying "what happened in the last hour?" requires scanning the raw event_log table. EP14 builds observability starting with this aggregation engine as the foundation.

Existing infrastructure:
- `event_log` table with structured JSON payloads (EP02)
- Per-stage metrics in task metadata (EP09)
- Pipeline events: `pipeline.stage.completed/entered/skipped` (EP09)
- Cost events: `cost.llm`, `cost.tool` (EP05/EP08)
- Budget records table (EP11)

---

## Scope

### In Scope

- Migration 006: `metrics_aggregated` table
- `SqliteMetricsRepository`: CRUD for aggregated metrics
- `MetricsAggregator`: SQL-based aggregation engine with cron scheduling
- `metrics.refresh` tool for on-demand refreshes
- `setupObservability()` registration module
- Domain types and TypeBox schemas

### Out of Scope

- HTTP endpoints (Task 0100)
- Timeline endpoint (Task 0101)
- Structured logging (Task 0102)
- Heatmap (Task 0103)

---

## Requirements

1. Compute 5 metric types via pure SQL: agent_activity, event_type_count, pipeline_throughput, cost_summary, stage_duration
2. Incremental aggregation (only process events since last computation)
3. Aggregation completes in < 1s for 1000 events
4. Cron-based automatic refresh (every 5 min for hourly, every 60 min for daily)
5. On-demand refresh via `metrics.refresh` tool
6. No `any` types; TypeBox schemas for external contracts

---

## Acceptance Criteria

- [ ] AC1: Migration 006 creates `metrics_aggregated` table with UNIQUE constraint and index
- [ ] AC2: All 5 metric types computed and stored correctly
- [ ] AC3: Incremental aggregation only processes new events (since last `computed_at`)
- [ ] AC4: `metrics.refresh` tool registered and returns aggregation summary
- [ ] AC5: Cron starts/stops cleanly without leaks
- [ ] AC6: >= 90% test coverage

---

## Constraints

- `index.ts` is 492 LOC (limit 500) -- add max 5 lines, delegate to registration module
- TypeBox schemas for tool parameters
- Follow existing repository pattern (`SqliteBudgetRepository`)
- Follow existing tool pattern (`pipeline-advance.ts`)

---

## Implementation Steps

1. Add Migration 006 to `src/persistence/migrations.ts`
2. Create `src/observability/metrics-types.ts` with domain types + TypeBox schemas
3. Create `src/observability/metrics-repository.ts` with `SqliteMetricsRepository`
4. Create `src/observability/metrics-aggregator.ts` with SQL aggregation + cron
5. Create `src/observability/metrics-refresh-tool.ts` with tool definition
6. Create `src/observability/registration.ts` as entry point
7. Modify `src/tools/index.ts` to add `metricsAggregator` to ToolDeps
8. Wire into `src/index.ts` (minimal changes)

---

## Testing Plan

- Unit tests: metrics-types validation, repository CRUD, aggregator logic
- Integration tests: seed event_log, run aggregation, verify correct SQL results
- Tool tests: invoke metrics.refresh, verify result shape

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Tests written and passing
- [ ] Coverage >= 90%
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
- [ ] Infrastructure tested manually by user

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md)
- [Coding Standards](../../.agent/rules/coding-standards.md)
- [Testing Standards](../../.agent/rules/testing-standards.md)
