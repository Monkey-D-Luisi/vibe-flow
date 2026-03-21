# Task: 0136 -- Extend API Client with Metrics/Timeline

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP15 -- Telegram Control Plane v2 |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-21 |
| Branch | `feat/EP15-telegram-control-plane-v2` |

---

## Goal

Extend the telegram-notifier API client with methods to query EP14 observability endpoints (metrics, timeline, heatmap) so Telegram commands can render real-time data.

---

## Context

EP14 added observability endpoints to product-team. The telegram-notifier api-client.ts needed new methods to call these HTTP routes.

---

## Scope

### In Scope

- Add 3 response types (ApiMetricsResponse, ApiTimelineResponse, ApiHeatmapResponse)
- Add 3 methods (getMetrics, getTimeline, getHeatmap) to the API client

### Out of Scope

- Modifying product-team endpoints
- Adding new HTTP routes

---

## Requirements

1. getMetrics accepts period param.
2. getTimeline accepts optional taskId.
3. getHeatmap accepts optional bucketMinutes.
4. All methods use existing HTTP GET helper.

---

## Acceptance Criteria

- [x] AC1: getMetrics, getTimeline, getHeatmap methods exist on ProductTeamApiClient.
- [x] AC2: Response types match EP14 endpoint shapes.
- [x] AC3: TypeScript compiles without errors.

---

## Constraints

- Must reuse existing `get()` helper, no new HTTP libraries

---

## Implementation Steps

1. Define response types.
2. Add method signatures to interface.
3. Implement methods using existing get() helper.
4. Typecheck.

---

## Testing Plan

- Covered by downstream command modules that mock the API client.

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 70% minor)
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
