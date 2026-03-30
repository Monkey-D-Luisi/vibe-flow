# Walkthrough: 0142 -- Inline Keyboard Buttons for Decisions

## Task Reference

- Task: `docs/tasks/0142-inline-keyboard-buttons.md`
- Epic: EP21 -- Agent Excellence & Telegram Command Center
- Branch: `feat/EP21-agent-excellence-telegram-command-center`

---

## Summary

Added inline keyboard buttons to decision escalation messages. The key insight
was that the OpenClaw gateway converts `callback_data` into synthetic text
messages via `processMessage`. By formatting callback data as slash commands
(`/approve DEC-001 option-a`), button presses route to existing command handlers
with zero new infrastructure.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Slash command format in callback_data | Gateway converts callback_data to synthetic text → routes to existing handlers |
| Full decision ID (not shortened) | Avoids lookup complexity, gateway handles the routing |
| Separate approve row per option + single reject button | Clear UX, one tap per action |

---

## Implementation Notes

### Approach

Initially callback_data used a custom format (`dec:approve:<shortId>:<option>`).
This required a custom handler for the custom prefix. After discovering that the
gateway converts unrecognized callback_data to synthetic text messages via
`processMessage`, the format was changed to `/approve <id> <option>` — this
routes directly to the existing `/approve` command handler.

### Key Changes

- `buildDecisionButtons` generates `InlineButtonGrid` with `/approve` and `/reject` as callback_data
- `formatDecisionCard` produces MarkdownV2 decision summary
- `extractDecisionData` pulls card data from `decision_evaluate` tool call events

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/telegram-notifier/src/decision-buttons.ts` | Modified | callback_data changed to slash command format |
| `extensions/telegram-notifier/test/decision-buttons.test.ts` | Modified | Updated test assertions for new format |

---

## Checklist

- [x] Task spec read end-to-end
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
