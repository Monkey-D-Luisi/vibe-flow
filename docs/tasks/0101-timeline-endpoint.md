# Task 0101 -- /api/timeline Pipeline Execution Endpoint

**Epic:** EP14 -- Local-First Observability
**Phase:** 11B
**Status:** IN_PROGRESS
**Depends on:** Task 0099, Task 0100

## Objective

Expose an HTTP endpoint (`GET /api/timeline`) that returns pipeline stage timeline data from event_log. Optionally filter by taskId.

## Acceptance Criteria

1. `GET /api/timeline` returns active pipeline tasks with their stage timeline
2. `GET /api/timeline?taskId=X` returns timeline for a specific task
3. Stage events sourced from event_log (pipeline.stage.entered, pipeline.stage.completed)
4. Shared timeline computation extracted to `timeline-utils.ts`
5. Test coverage >= 90%
