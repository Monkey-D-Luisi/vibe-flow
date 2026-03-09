# Walkthrough: 0087 -- Telegram /budget Real-Time Dashboard

## Task Reference

- Task: `docs/tasks/0087-telegram-budget-dashboard.md`
- Epic: EP11 -- Budget Intelligence
- Branch: `feat/0087-telegram-budget-dashboard`
- PR: TBD

---

## Summary

Replaced the stub `/budget` Telegram command with a real-time budget dashboard that renders global, pipeline, and per-agent budget consumption using Unicode progress bars. Added `/budget replenish` and `/budget reset` subcommands for budget management from Telegram.

---

## Context

Tasks 0084-0086 built the budget engine, per-agent tracking, and model-tier auto-downgrade. The Telegram `/budget` command still returned a placeholder ("Budget tracking coming in Task 0046"). The budget data was available in the `budget_records` table — this task surfaces it via Telegram.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Created `BudgetDataSource` interface for DI | Keeps budget-dashboard.ts testable without `_sharedDb` cast; the adapter lives in index.ts |
| Used `_sharedDb` adapter pattern (same as /approve, /decisions) | Consistent with existing telegram-notifier DB access; EP13 will replace this with stable API |
| Progress bars use Unicode block chars (█░) | Renders correctly in Telegram without special formatting |
| Module exports all types and pure functions | Enables thorough unit testing without Telegram API or SQLite |
| Shows latest pipeline when multiple exist | Most relevant for operator monitoring |
| Filters agents by pipeline ID prefix | Agent scopeIds are `<pipelineId>::<agentId>` — filtering ensures only current pipeline's agents shown |

---

## Implementation Notes

### Approach

Created a new `budget-dashboard.ts` module with pure rendering functions and a `BudgetDataSource` dependency injection interface. The module handles:
1. Dashboard rendering with progress bars, warning indicators, and USD/token display
2. `/budget replenish <scope> <scopeId> <amount>` subcommand with validation
3. `/budget reset agent <agentScopeId>` subcommand

The index.ts creates a `BudgetDataSource` adapter over `_sharedDb` (same pattern as decision commands) and delegates to `handleBudgetCommand()`.

### Key Changes

- New `budget-dashboard.ts` with `renderProgressBar`, `renderDashboard`, and `handleBudgetCommand` exports
- Replaced stub `/budget` handler in index.ts with real implementation using `_sharedDb` adapter
- Added `mapRow()` helper to convert snake_case DB rows to BudgetRecord objects
- 30 new tests covering rendering, subcommands, validation, and edge cases

---

## Commands Run

```bash
pnpm --filter telegram-notifier test
pnpm test
pnpm lint
pnpm typecheck
pnpm --filter telegram-notifier exec vitest run --coverage
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/telegram-notifier/src/budget-dashboard.ts` | Created | Budget dashboard rendering, subcommand handling, BudgetDataSource interface |
| `extensions/telegram-notifier/src/index.ts` | Modified | Replaced stub /budget handler with real implementation; added mapRow helper and BudgetDataSource adapter |
| `extensions/telegram-notifier/test/budget-dashboard.test.ts` | Created | 30 tests: progress bar, dashboard rendering, replenish, reset, validation, edge cases |
| `docs/tasks/0087-telegram-budget-dashboard.md` | Created | Task specification |
| `docs/walkthroughs/0087-telegram-budget-dashboard.md` | Created | This walkthrough |
| `docs/roadmap.md` | Modified | Task 0087 status PENDING → DONE |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| Unit (budget-dashboard) | 30 | 30 | 99% stmts, 93% branch, 100% funcs, 100% lines |
| Unit (index + formatting) | 43 | 43 | -- |
| Total (telegram-notifier) | 73 | 73 | -- |

---

## Follow-ups

- Task 0088 (Budget Forecasting) will add proactive alerts to Telegram
- EP13 will replace `_sharedDb` cast with stable plugin shared state API

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
