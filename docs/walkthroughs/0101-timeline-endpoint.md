# Walkthrough 0101 -- /api/timeline Pipeline Execution Endpoint

**Task:** 0101
**Epic:** EP14 -- Local-First Observability

## Files Changed

| File | Change |
|------|--------|
| `src/observability/timeline-utils.ts` | New: shared stage timeline computation from event_log |
| `src/observability/timeline-query-handler.ts` | New: HTTP handler for `GET /api/timeline` |
| `src/registration/http-routes.ts` | Modified: Add timeline route |
| `test/observability/timeline-utils.test.ts` | New: timeline computation tests |
| `test/observability/timeline-query-handler.test.ts` | New: handler tests |
