# Walkthrough: 0135 -- Fix Speech Bubble Suppression on Consecutive Same-Tool Calls

## Task Reference

- Task: `docs/tasks/0135-fix-speech-bubble-suppression.md`
- Epic: EP15 -- Telegram Control Plane v2
- Branch: `feat/EP15-telegram-control-plane-v2`

---

## Summary

Fixed a bug where the virtual office speech bubbles would not appear when an agent called the same tool consecutively. Added a `toolCallSeq` counter to agent state that increments on every `before_tool_call`, and changed `after_tool_call` to clear `currentTool` to null. The client-side bubble trigger now checks both tool name changes and sequence number changes.

---

## Context

Docker logs from a 21:06 test showed all 8 agents were active with tool calls, but the user observed missing speech bubbles. Root cause: `onAfterToolCall` kept `currentTool` set to the same value, so consecutive calls to the same tool (e.g., PM calling `team_message` 7 times in 300ms) only triggered one bubble.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Use `toolCallSeq` counter instead of timestamp | Counter is deterministic and easier to test; timestamps could collide in rapid-fire scenarios |
| Clear `currentTool` to null in `onAfterToolCall` | Semantically correct (tool is done) and creates a natural reset point for the next call |
| Additive SSE field (not breaking) | `toolCallSeq` is optional for older clients; they just won't see the improvement |

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/virtual-office/src/state/agent-state-store.ts` | Modified | Added `toolCallSeq: number` to `AgentState`, initialized to `0` |
| `extensions/virtual-office/src/state/event-mapper.ts` | Modified | Increment `toolCallSeq` in `onBeforeToolCall`, clear `currentTool` in `onAfterToolCall` |
| `extensions/virtual-office/src/public/net/sse-client.ts` | Modified | Added `toolCallSeq` to `ServerAgentState` |
| `extensions/virtual-office/src/public/office.ts` | Modified | Updated bubble trigger to also check `toolCallSeq` changes |
| `extensions/virtual-office/test/event-mapper.test.ts` | Modified | Added tests for seq counter increment and after_tool_call null reset |
| `extensions/virtual-office/test/agent-state-store.test.ts` | Modified | Added test for `toolCallSeq` initialization |

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
