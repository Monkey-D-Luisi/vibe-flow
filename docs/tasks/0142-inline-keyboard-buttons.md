# Task: 0142 -- Inline Keyboard Buttons for Decisions

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

Add inline keyboard buttons to decision escalation messages in Telegram so
reviewers can approve or reject decisions with a single tap.

---

## Context

Decision escalations appeared as plain text messages requiring the reviewer to
type `/approve DEC-001 option-a` manually. Telegram's inline keyboard API
supports callback buttons that can trigger actions. The OpenClaw gateway
converts `callback_data` into synthetic text messages via `processMessage`,
so callback data in slash command format routes to existing handlers.

---

## Scope

### In Scope

- `buildDecisionButtons` function generating inline keyboard grid
- `formatDecisionCard` for rich MarkdownV2 decision display
- `extractDecisionData` to pull card data from tool call events
- callback_data format using `/approve` and `/reject` slash commands
- Integration in `after_tool_call` for `decision_evaluate`

### Out of Scope

- Custom callback_query handling (gateway already handles this)
- Multi-step approval workflows

---

## Requirements

1. Buttons must use slash command format (`/approve <id> <option>`)
2. Gateway converts callback_data to synthetic messages automatically
3. Decision card must show all options with clear labels

---

## Acceptance Criteria

- [x] AC1: `buildDecisionButtons` creates a grid with approve + reject buttons
- [x] AC2: callback_data uses `/approve <id> <option>` format
- [x] AC3: `formatDecisionCard` produces MarkdownV2 with decision context
- [x] AC4: Integration fires on `decision_evaluate` in after_tool_call
- [x] AC5: Unit tests cover button generation and data extraction

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
