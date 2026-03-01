# Walkthrough 0037 -- Telegram Channel Integration Plugin

## Goal (restated)
Build an OpenClaw plugin that bridges agent lifecycle events to a Telegram group
and accepts human commands for team control.

## Decisions
- **Built on native Telegram channel**: OpenClaw has first-class Telegram support
  via grammy. The plugin uses lifecycle hooks and commands, not a standalone bot.
- **Rate-limited message queue**: A background service flushes messages at
  ~3sec to stay within Telegram's 30 msg/min/group limit.
- **Plugin commands**: Used `api.registerCommand()` for `/status`, `/idea`,
  `/health`, `/budget`. These bypass the LLM agent and return directly.
- **MarkdownV2 formatting**: Telegram's strictest markdown mode for consistent
  rendering. All special chars escaped via `escapeMarkdownV2()`.
- **Extracted formatting module**: `src/formatting.ts` exports all message
  formatting functions for testability; `src/index.ts` imports from it.

## Files Created / Modified
- `extensions/telegram-notifier/src/formatting.ts` — Exported formatting utilities (`escapeMarkdownV2`, `formatTaskTransition`, `formatPrCreation`, `formatQualityGate`, `formatAgentError`)
- `extensions/telegram-notifier/src/index.ts` — Plugin entry; imports from formatting module (removed duplicate function definitions)
- `extensions/telegram-notifier/test/formatting.test.ts` — 21 unit tests for all formatting functions
- `extensions/telegram-notifier/test/index.test.ts` — 10 integration tests for plugin registration and command handlers
- `openclaw.docker.json` — Added `./extensions/telegram-notifier` to `plugins.load.paths` (D1 Telegram channel config was already present)

## Commands Run
```bash
pnpm test        # 31 passed (2 test files)
pnpm lint        # clean
pnpm typecheck   # clean
```

## Tests
- **31 tests, 2 files**: all green
  - `test/formatting.test.ts` — 21 tests: `escapeMarkdownV2`, `formatTaskTransition`, `formatPrCreation`, `formatQualityGate`, `formatAgentError`
  - `test/index.test.ts` — 10 tests: plugin metadata, hook registration, command registration, early-exit on missing groupId, command handler responses

## Trade-offs
- Commands return placeholder responses for `/status`, `/budget` — will be
  wired to real data in Tasks 0042 and 0046.
- Message queue is in-memory (lost on restart). Acceptable for notifications;
  the event log persists the actual data.

## Follow-ups
- Wire `/idea` command to `pipeline.start` tool (Task 0042)
- Wire `/status` to real agent status from orchestrator (Task 0042)
- Wire `/budget` to cost tracking data (Task 0046)
- Add `/pause`, `/resume`, `/assign` commands (Task 0042)
