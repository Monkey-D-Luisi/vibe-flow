# Task 0131 -- WebSocket Bridge (SSE)

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP20 -- Virtual Office |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-20 |
| Branch | `feat/EP20-virtual-office` |

---

## Goal

Bridge server-side lifecycle hooks to the frontend via Server-Sent Events at `/office/events`, enabling real-time visualization of agent activity.

---

## Scope

### In Scope

- In-memory AgentStateStore tracking 8 agents
- Event mapper converting lifecycle hooks to state changes
- SSE endpoint at `/office/events` with snapshot + incremental updates
- Lifecycle hook registration (before_tool_call, after_tool_call, agent_end, subagent_spawned)
- Frontend EventSource client wrapper
- State reconciliation module

### Out of Scope

- State-to-animation mapping (task 0132)
- WebSocket transport (SSE chosen for reliability)

---

## Acceptance Criteria

- [ ] AC1: AgentStateStore initializes with 8 agents in idle status
- [ ] AC2: SSE endpoint sends snapshot event on connection
- [ ] AC3: State updates broadcast as incremental events
- [ ] AC4: Lifecycle hooks update agent state correctly
- [ ] AC5: Client disconnect cleans up SSE subscription
- [ ] AC6: All tests pass

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Tests written and passing
- [ ] Coverage meets threshold (>= 50%)
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
