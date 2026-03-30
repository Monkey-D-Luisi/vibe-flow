# Task: 0143 -- Live Pipeline Tracker Message

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP21 -- Agent Excellence & Telegram Command Center |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-03-21 |
| Branch | `feat/EP21-agent-excellence-telegram-command-center` |

---

## Goal

Replace per-advance flood messages with a single Telegram message that is
edited in-place as the pipeline progresses through stages.

---

## Context

Each `pipeline_advance` call sent a new message to Telegram, creating chat
flood. Telegram's `editMessageText` API allows updating a single message.
By tracking the message ID per pipeline, we can update one tracker message
showing all stages with their current status.

---

## Scope

### In Scope

- Pipeline tracker module (`pipeline-tracker.ts`)
- Pipeline advance event handler (`pipeline-advance-handler.ts`)
- In-memory tracking of message IDs per pipeline
- Stage progression visualization with emoji indicators
- Integration via `editMessageTelegram` runtime API

### Out of Scope

- Persistent message ID storage (in-memory is sufficient)
- Thread/topic routing

---

## Requirements

1. Single message per pipeline, updated on each advance
2. Visual stage indicators (completed, current, pending)
3. Graceful fallback if edit fails (send new message)

---

## Acceptance Criteria

- [x] AC1: Pipeline tracker stores message IDs per pipeline
- [x] AC2: Advance handler edits existing message instead of sending new one
- [x] AC3: Stage visualization shows completed/current/pending stages
- [x] AC4: Fallback sends new message if edit fails
- [x] AC5: Unit tests cover tracker state management

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
