# Task 0103 -- Agent Activity Heatmap

**Epic:** EP14 -- Local-First Observability
**Phase:** 11C
**Status:** DONE
**Depends on:** Task 0099

## Objective

Expose `GET /api/metrics/heatmap` that returns time-bucketed agent activity data suitable for rendering as a heatmap visualization.

## Acceptance Criteria

1. `GET /api/metrics/heatmap` returns bucketed agent activity JSON
2. Supports `?bucketMinutes=15|30|60` (default 15), `?since=...`, `?until=...`
3. SQL-based bucketing using `strftime()` for efficiency
4. Response includes: agents[], buckets[{start, counts}], totals{}
5. Test coverage >= 90%
