# Walkthrough 0100 -- /api/metrics System Health Endpoint

**Task:** 0100
**Epic:** EP14 -- Local-First Observability

## Files Changed

| File | Change |
|------|--------|
| `src/observability/metrics-query-handler.ts` | New: HTTP handler for `GET /api/metrics` |
| `src/registration/http-routes.ts` | Modified: Add observability route config + registration |
| `src/index.ts` | Modified: Pass observability deps to `registerHttpRoutes` |
| `test/observability/metrics-query-handler.test.ts` | New: Handler tests with seeded data |

## Implementation Notes

- Follows `budget-query-handler.ts` pattern (deps injection, `sendJson` helper)
- Primary data source: `metrics_aggregated` table (pre-computed by cron)
- Fallback: live SQL queries when aggregated data is empty
- Budget data sourced from `budget_records` table
- Pipeline state from `orchestrator_state` + `task_records`
