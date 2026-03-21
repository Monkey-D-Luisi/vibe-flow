# Task 0100 -- /api/metrics System Health Endpoint

**Epic:** EP14 -- Local-First Observability
**Phase:** 11A (foundation)
**Status:** DONE
**Depends on:** Task 0099

## Objective

Expose an HTTP endpoint (`GET /api/metrics`) that returns a structured JSON health summary, combining pre-aggregated metrics from `metrics_aggregated` with live budget data.

## Acceptance Criteria

1. `GET /api/metrics` returns 200 with complete health JSON
2. Response includes: system status, agent activity, pipeline state, cost summary, budget info, last refresh timestamp
3. Falls back to live SQL queries when `metrics_aggregated` is empty
4. Query parameter `?period=hour|day|all` controls aggregation window (default: `hour`)
5. Handler follows existing pattern from `budget-query-handler.ts`
6. Test coverage >= 90% with seeded data scenarios

## Response Shape

```json
{
  "timestamp": "...",
  "system": { "status": "healthy", "activePipelines": 1 },
  "agents": { "pm": { "eventsInPeriod": 42, "lastSeen": "..." } },
  "pipeline": { "activeTasks": 2, "stageDistribution": { "IMPLEMENTATION": 1 } },
  "costs": { "totalTokens": 50000, "byAgent": { "pm": 10000 } },
  "budget": { "globalConsumed": 3.12, "globalLimit": 10.0 },
  "lastRefresh": "..."
}
```
