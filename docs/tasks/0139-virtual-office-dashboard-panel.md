# Task: 0139 -- Virtual Office Dashboard Panel

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP15 -- Telegram Control Plane v2 |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-03-21 |
| Branch | `feat/EP15-telegram-control-plane-v2` |

---

## Goal

Add a DOM-based real-time dashboard sidebar to the virtual office page, showing agent status, pipeline summary, and activity feed alongside the pixel-art canvas.

---

## Context

The /office page has 480px of empty space on each side of the 960px grid on a 1920px display. A sidebar dashboard leverages the existing SSE connection to surface live telemetry without any additional network requests.

---

## Scope

### In Scope

- Dashboard panel (320px right sidebar)
- Agent status rows with status dots
- Pipeline summary
- Activity feed (last 20 events)
- CSS styling
- SSE wiring in office.ts

### Out of Scope

- Drag/resize
- Collapsible panel
- Chart rendering

---

## Requirements

1. 320px fixed right sidebar.
2. 8 agent rows with status dot, name, current tool, pipeline stage.
3. Pipeline summary showing active task.
4. Activity feed with last 20 SSE events.
5. Auto-updates via existing SSE callbacks.

---

## Acceptance Criteria

- [x] AC1: Dashboard renders on page load.
- [x] AC2: Agent rows update on SSE state changes.
- [x] AC3: Activity feed shows recent events.
- [x] AC4: 8 tests pass for ActivityFeed.

---

## Constraints

- No new network requests, reuse existing SSE connection.

---

## Implementation Steps

1. Create activity-feed.ts with capped buffer.
2. Create dashboard-panel.ts with DOM construction.
3. Add CSS to index.html.
4. Wire SSE callbacks in office.ts.

---

## Testing Plan

- Unit tests: 8 tests for ActivityFeed (capped buffer, event handling, ordering).
- Dashboard panel tested via E2E (DOM-dependent).

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
