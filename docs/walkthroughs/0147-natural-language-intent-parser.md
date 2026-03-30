# Walkthrough: 0147 -- Natural Language Intent Parser

## Task Reference

- Task: `docs/tasks/0147-natural-language-intent-parser.md`
- Epic: EP21 -- Agent Excellence & Telegram Command Center
- Branch: `feat/EP21-agent-excellence-telegram-command-center`

---

## Summary

Created a regex-based intent parser that maps natural language Telegram messages
to structured intents. Wired into index.ts as the `/ask` command, which parses
free-form text and suggests the equivalent slash command.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Regex patterns over LLM | Zero latency, no API cost, deterministic, sufficient for command mapping |
| Confidence scoring by match coverage | Simple heuristic, higher coverage = higher confidence |
| Suggest command instead of executing | SDK doesn't support `executeCommand` — suggest is safe and transparent |

---

## Implementation Notes

### Key Changes

- `parseIntent(text)` — matches against 8 intent pattern groups with confidence scoring
- `intentToCommand(intent)` — maps intent to `{ command, args }` for slash command equivalence
- `/ask` command registered in index.ts — delegates to intent parser, returns suggested command

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/telegram-notifier/src/intents/intent-parser.ts` | Created | Intent parser with 8 intent types |
| `extensions/telegram-notifier/test/intents/intent-parser.test.ts` | Created | Tests for all intent types |
| `extensions/telegram-notifier/src/index.ts` | Modified | Import intent parser, register `/ask` command |

---

## Checklist

- [x] Task spec read end-to-end
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
