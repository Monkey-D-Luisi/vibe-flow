# Walkthrough: 0084 -- Hard Budget Limits Engine

## Task Reference

- Task: `docs/tasks/0084-hard-budget-limits-engine.md`
- Epic: [EP11 -- Budget Intelligence](../backlog/EP11-budget-intelligence.md)
- Branch: `feat/0084-hard-budget-limits-engine`
- PR: TBD

---

## Summary

Implemented a hierarchical hard budget limits engine for the product-team extension. Budget records track token and USD consumption at four scopes (global, pipeline, stage, agent) with automatic status transitions (active → warning → exhausted) and enforcement logic that blocks LLM requests when any scope is exhausted.

---

## Context

Budget tracking existed as advisory-only soft warnings (EP06). EP09 added per-stage token cost tracking to the event log. The Telegram `/budget` command returned a placeholder. This task introduces hard budget limits that enforce spending caps, forming the foundation for EP11's full budget intelligence system.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Hierarchical scope model (global → pipeline → stage → agent) | Matches the natural enforcement hierarchy — global limits protect the entire system, pipeline limits protect individual runs, and agent limits protect per-agent budgets |
| Unique constraint on (scope, scope_id) | Prevents duplicate budget records for the same scope — only one budget per scope/scopeId pair |
| Optimistic concurrency via `rev` field | Follows existing pattern from task-repository for safe concurrent updates |
| Pure function `computeBudgetStatus` for status computation | Keeps domain logic testable without DB dependencies |
| `budget.transition` event type | New event namespace distinct from existing `cost.*` events — transitions are enforcement events, not plain cost tracking |
| Check-then-record pattern in budget guard | Separates read (check) from write (record) to allow callers to inspect budget state without side effects |

---

## Implementation Notes

### Approach

Domain-first implementation: built the pure domain model and factory functions first, then the SQLite persistence layer with migration, then the orchestrator-level budget guard that wires domain logic to persistence and event logging.

### Key Changes

1. **Domain model** (`domain/budget.ts`): `BudgetRecord` interface with factory function, status computation, and helper functions for remaining tokens/USD/consumption ratio.
2. **Error classes** (`domain/errors.ts`): Added `BudgetExhaustedError` and `BudgetNotFoundError`.
3. **Migration 005** (`persistence/migrations.ts`): Creates `budget_records` table with CHECK constraints on scope and status, plus indexes for scope lookup and status filtering.
4. **Persistence** (`persistence/budget-repo.ts`): Full CRUD + `updateConsumption`, `replenish`, `resetConsumption` with optimistic locking.
5. **Budget guard** (`orchestrator/budget-guard.ts`): `checkBudget` (non-throwing), `enforceBudget` (throwing), `recordConsumption` (writes + emits events), and `buildScopeChain` helper.
6. **Event log** (`orchestrator/event-log.ts`): Added `logBudgetTransition` method with `budget.transition` event type.

---

## Commands Run

```bash
npx vitest run                    # 955 tests passed (96 files)
pnpm lint                         # 0 errors across all packages
pnpm typecheck                    # 0 errors across all packages
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/domain/budget.ts` | Created | Budget domain model: interfaces, factory, status computation, helpers |
| `extensions/product-team/src/domain/errors.ts` | Modified | Added BudgetExhaustedError and BudgetNotFoundError |
| `extensions/product-team/src/persistence/migrations.ts` | Modified | Added MIGRATION_005 for budget_records table |
| `extensions/product-team/src/persistence/budget-repo.ts` | Created | SQLite budget repository with CRUD + consumption tracking |
| `extensions/product-team/src/orchestrator/budget-guard.ts` | Created | Budget enforcement guard: check, enforce, record, scope chain |
| `extensions/product-team/src/orchestrator/event-log.ts` | Modified | Added logBudgetTransition method and BudgetTransitionPayload |
| `extensions/product-team/test/domain/budget.test.ts` | Created | 30 unit tests for domain model |
| `extensions/product-team/test/persistence/budget-repo.test.ts` | Created | 13 integration tests for persistence |
| `extensions/product-team/test/orchestrator/budget-guard.test.ts` | Created | 12 integration tests for guard logic |
| `extensions/product-team/test/persistence/connection.test.ts` | Modified | Updated migration count assertions (4 → 5) |
| `docs/tasks/0084-hard-budget-limits-engine.md` | Created | Task specification |
| `docs/walkthroughs/0084-hard-budget-limits-engine.md` | Created | This walkthrough |
| `docs/roadmap.md` | Modified | Task 0084 status: PENDING → DONE |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| Domain (budget) | 30 | 30 | 100% |
| Persistence (budget-repo) | 13 | 13 | ~95% |
| Orchestrator (budget-guard) | 12 | 12 | ~95% |
| Total (new) | 55 | 55 | >= 90% |
| Total (all product-team) | 955 | 955 | -- |

---

## Follow-ups

- Task 0085: Per-agent budget tracking integration (hooks into `after_tool_call`)
- Task 0086: Wire budget guard into model-router's `before_model_resolve` hook
- Task 0087: Replace Telegram `/budget` stub with real dashboard using budget-repo data
- Wire budget-guard into index.ts plugin registration (deferred to task 0085 which adds the hook)

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
