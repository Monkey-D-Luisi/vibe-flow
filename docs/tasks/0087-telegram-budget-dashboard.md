# Task: 0087 -- Telegram /budget Real-Time Dashboard

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP11 -- Budget Intelligence |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-09 |
| Branch | `feat/0087-telegram-budget-dashboard` |

---

## Goal

Replace the stub `/budget` Telegram command with a real-time dashboard showing budget consumption across global, pipeline, and agent scopes, plus replenish/reset subcommands.

---

## Context

The Telegram `/budget` command currently returns a placeholder ("Budget tracking coming in Task 0046"). Tasks 0084-0086 built the budget engine, per-agent tracking, and model-tier auto-downgrade. The data is available -- this task surfaces it in a human-readable Telegram dashboard.

Related:
- Task 0084: Hard Budget Limits Engine (DONE)
- Task 0085: Per-Agent Budget Tracking and Enforcement (DONE)
- Task 0086: Budget-Triggered Model Tier Auto-Downgrade (DONE)

---

## Scope

### In Scope

- New `budget-dashboard.ts` module in telegram-notifier
- `/budget` command rendering real-time progress bars
- `/budget replenish <scope> <id> <amount>` subcommand
- `/budget reset agent <agentId>` subcommand
- Replace stub handler in telegram-notifier index.ts
- Unit tests with >= 90% coverage

### Out of Scope

- Proactive budget alerts (Task 0088)
- Budget forecasting (Task 0088)
- Changes to the budget engine itself (Tasks 0084-0085)

---

## Requirements

1. Dashboard renders global, pipeline, and per-agent budget data using Unicode progress bars
2. Warning emoji shown for agents above warning threshold
3. Replenish/reset commands validate input and update budget records
4. All budget data read from the budget repository (no direct SQL)
5. Module is testable in isolation (dependency injection for budget repo)

---

## Acceptance Criteria

- [x] AC1: `/budget` displays real-time dashboard with progress bars for global, pipeline, and per-agent scopes
- [x] AC2: Warning emoji (⚠️) shown for budgets above warning threshold
- [x] AC3: `/budget replenish` subcommand validates and updates budget records
- [x] AC4: `/budget reset agent <agentId>` resets agent budget for current pipeline
- [x] AC5: Stub handler in telegram-notifier/index.ts replaced with real implementation
- [x] AC6: >= 90% test coverage

---

## Constraints

- Must use existing budget domain model from product-team extension
- No breaking changes to existing Telegram commands
- Module must be testable without Telegram API connection

---

## Implementation Steps

1. Read existing telegram-notifier structure and budget domain code
2. Create `budget-dashboard.ts` with dashboard rendering and command handling
3. Write unit tests for rendering, subcommands, and edge cases
4. Replace stub handler in `index.ts`
5. Run quality checks

---

## Testing Plan

- Unit tests: Dashboard rendering (full budget, partial, empty), progress bar formatting, threshold warnings, subcommand parsing/validation
- Integration tests: Not needed (budget repo is mocked)
- Contract tests: Dashboard output format matches spec

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 90%)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
