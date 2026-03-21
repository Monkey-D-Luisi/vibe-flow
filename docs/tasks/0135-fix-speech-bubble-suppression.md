# Task: 0135 -- Fix Speech Bubble Suppression on Consecutive Same-Tool Calls

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

Fix the virtual office speech bubble rendering so that consecutive calls to the same tool by an agent produce a visible bubble for each invocation, not just the first.

---

## Context

The virtual office (`/office`) shows floating speech bubbles above agents when they invoke tools. The bubble trigger condition compares `change.state.currentTool !== prev?.currentTool`, but `onAfterToolCall` keeps `currentTool` set to the same value as `onBeforeToolCall`. When an agent calls the same tool consecutively (e.g., PM calling `team_message` 7 times in rapid succession), no bubble appears for the 2nd-7th calls because the tool name hasn't changed.

Observed during a test at 21:06 on 2026-03-21: all 8 agents were active (confirmed via Docker logs), but speech bubbles did not appear for all agents.

---

## Scope

### In Scope

- Add `toolCallSeq` counter to `AgentState` to track tool call sequence numbers
- Increment counter on each `onBeforeToolCall` so repeated same-tool calls are detectable
- Clear `currentTool` to `null` in `onAfterToolCall` since the tool is done
- Update client-side bubble trigger to also check `toolCallSeq` changes
- Update `ServerAgentState` type in SSE client to include `toolCallSeq`

### Out of Scope

- Debouncing rapid-fire bubbles (visual, separate concern)
- Dashboard panel changes (Task 0139)
- Telegram command changes (Tasks 0104-0108)

---

## Requirements

1. Every `before_tool_call` event must produce a speech bubble, even if the tool name is the same as the previous call
2. `after_tool_call` must clear `currentTool` to `null` so the agent doesn't appear to be "using" a tool after it completes
3. `toolCallSeq` must be transmitted via SSE and usable by the client for change detection
4. Existing tests must continue to pass (backwards compatible state shape)

---

## Acceptance Criteria

- [x] AC1: Repeated same-tool calls (e.g., `team_message` x3) each produce a speech bubble
- [x] AC2: `onAfterToolCall` sets `currentTool: null` in the store
- [x] AC3: `toolCallSeq` increments on every `onBeforeToolCall`
- [x] AC4: Client-side bubble trigger uses `toolCallSeq` for change detection
- [x] AC5: All existing tests pass, new tests cover the fix

---

## Constraints

- No external dependencies
- Must not break SSE protocol (additive field only)
- `event-mapper.ts` must stay under 500 LOC

---

## Implementation Steps

1. Add `toolCallSeq: number` to `AgentState` interface and initialize to `0`
2. In `onBeforeToolCall`, read current seq and increment
3. In `onAfterToolCall`, set `currentTool: null`
4. Add `toolCallSeq` to `ServerAgentState` in `sse-client.ts`
5. Update bubble trigger in `office.ts` to check seq changes
6. Write tests for all changes

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
