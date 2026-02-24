# Walkthrough: 0002 -- Task Engine

## Task Reference

- Task: `docs/tasks/0002-task-engine.md`
- Epic: EP02
- Branch: `feat/0002-task-engine`
- PR: #161 (merged `e495235` into main)

---

## Summary

Implemented the full TaskRecord lifecycle engine for the product-team plugin. This includes the domain model with TypeBox validation, SQLite persistence with WAL mode and optimistic locking, a strict state machine with valid transitions, an append-only event log, lease-based ownership, and 5 OpenClaw tools registered via the plugin API.

---

## Context

The product-team plugin scaffold existed with a stub `register()` function (from task 2.1). Dependencies (`@sinclair/typebox`, `better-sqlite3`, `ulid`) were already installed. This task implemented tasks 2.2 through 2.6 of EP02.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| TypeBox compiler instead of Ajv for validation | Ajv had ESM/CJS compatibility issues with `moduleResolution: NodeNext`. TypeBox's built-in `TypeCompiler` provides the same validation without extra dependencies. |
| Separate `orchestrator_state` table from `task_records` | Follows EP02 spec: decouples workflow metadata from domain data. Each table has its own `rev` for independent optimistic locking. |
| `grooming -> in_progress` transition allowed | Supports FastTrack path planned for EP03. Including it now avoids migration later. |
| `in_review -> in_progress` and `qa -> in_progress` rejection loops | Required by the workflow to support review rejections. `roundsReview` counter incremented on `in_review -> in_progress`. |
| Tool defs as factory functions receiving deps | Unlike stateless quality-gate tools, task tools need database access. Factory pattern enables dependency injection and testability. |
| In-memory WAL test adjustment | SQLite cannot use WAL on in-memory databases (returns 'memory'). Test adjusted to reflect this behavior. |

---

## Implementation Notes

### Approach

Hexagonal architecture with 4 layers: Domain -> Persistence -> Orchestrator -> Tools. Built bottom-up: domain types first, then persistence, then business logic, then tool adapters. Tests written alongside each layer.

### Key Changes

- **Domain layer**: `TaskRecord`, `OrchestratorState` interfaces with factory functions. `TaskStatus` enum with valid transitions map. Six error classes for domain-specific failures.
- **Schemas**: Five TypeBox schemas for tool input validation. `TypeCompiler`-based validator with caching.
- **Persistence**: Four SQLite tables (`task_records`, `orchestrator_state`, `event_log`, `leases`) with schema versioning. Four repository classes with optimistic locking via `WHERE rev = ?`. Atomic task creation (task + orchestrator state in single transaction).
- **Orchestrator**: `EventLog` facade with typed event methods. `LeaseManager` with acquire/release/expiry. `transition()` function coordinating validation, lease check, state update, and event logging in a single transaction.
- **Tools**: Five tool definitions (`task.create`, `task.get`, `task.search`, `task.update`, `task.transition`) registered via `api.registerTool()`.

---

## Commands Run

```bash
pnpm test        # 128 tests pass in product-team, 251 total
pnpm typecheck   # Zero errors
pnpm lint        # Zero errors
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/domain/errors.ts` | Created | Six domain error classes |
| `extensions/product-team/src/domain/task-status.ts` | Created | TaskStatus enum, transitions map, isValidTransition |
| `extensions/product-team/src/domain/task-record.ts` | Created | TaskRecord, OrchestratorState interfaces, factory functions |
| `extensions/product-team/src/schemas/task-create.schema.ts` | Created | TypeBox schema for task.create input |
| `extensions/product-team/src/schemas/task-get.schema.ts` | Created | TypeBox schema for task.get input |
| `extensions/product-team/src/schemas/task-search.schema.ts` | Created | TypeBox schema for task.search input |
| `extensions/product-team/src/schemas/task-update.schema.ts` | Created | TypeBox schema for task.update input |
| `extensions/product-team/src/schemas/task-transition.schema.ts` | Created | TypeBox schema for task.transition input |
| `extensions/product-team/src/schemas/validator.ts` | Created | TypeBox TypeCompiler-based validator |
| `extensions/product-team/src/persistence/connection.ts` | Created | better-sqlite3 connection with WAL, FK, busy_timeout |
| `extensions/product-team/src/persistence/migrations.ts` | Created | Migration runner with 4 tables |
| `extensions/product-team/src/persistence/task-repository.ts` | Created | CRUD with optimistic locking, JSON serialization |
| `extensions/product-team/src/persistence/orchestrator-repository.ts` | Created | Orchestrator state CRUD with optimistic locking |
| `extensions/product-team/src/persistence/event-repository.ts` | Created | Append-only event log |
| `extensions/product-team/src/persistence/lease-repository.ts` | Created | Lease acquire/release/expire |
| `extensions/product-team/src/orchestrator/event-log.ts` | Created | EventLog facade with typed log methods |
| `extensions/product-team/src/orchestrator/lease-manager.ts` | Created | Lease business logic with event logging |
| `extensions/product-team/src/orchestrator/state-machine.ts` | Created | State machine transition function |
| `extensions/product-team/src/tools/index.ts` | Created | Tool index with ToolDeps interface |
| `extensions/product-team/src/tools/task-create.ts` | Created | task.create tool definition |
| `extensions/product-team/src/tools/task-get.ts` | Created | task.get tool definition |
| `extensions/product-team/src/tools/task-search.ts` | Created | task.search tool definition |
| `extensions/product-team/src/tools/task-update.ts` | Created | task.update tool definition |
| `extensions/product-team/src/tools/task-transition.ts` | Created | task.transition tool definition |
| `extensions/product-team/src/index.ts` | Modified | Wired all layers, registers 5 tools |
| `extensions/product-team/test/helpers.ts` | Created | Test database helper |
| `extensions/product-team/test/domain/task-status.test.ts` | Created | 23 tests for status transitions |
| `extensions/product-team/test/domain/task-record.test.ts` | Created | 12 tests for factory functions |
| `extensions/product-team/test/persistence/connection.test.ts` | Created | 6 tests for DB setup |
| `extensions/product-team/test/persistence/task-repository.test.ts` | Created | 18 tests for task CRUD |
| `extensions/product-team/test/persistence/orchestrator-repository.test.ts` | Created | 5 tests for orchestrator CRUD |
| `extensions/product-team/test/persistence/event-repository.test.ts` | Created | 5 tests for event log |
| `extensions/product-team/test/persistence/lease-repository.test.ts` | Created | 11 tests for leases |
| `extensions/product-team/test/orchestrator/state-machine.test.ts` | Created | 11 tests for transitions |
| `extensions/product-team/test/orchestrator/lease-manager.test.ts` | Created | 9 tests for lease manager |
| `extensions/product-team/test/tools/task-create.test.ts` | Created | 6 tests for task.create tool |
| `extensions/product-team/test/tools/task-get.test.ts` | Created | 3 tests for task.get tool |
| `extensions/product-team/test/tools/task-search.test.ts` | Created | 5 tests for task.search tool |
| `extensions/product-team/test/tools/task-update.test.ts` | Created | 4 tests for task.update tool |
| `extensions/product-team/test/tools/task-transition.test.ts` | Created | 4 tests for task.transition tool |
| `extensions/product-team/test/index.test.ts` | Modified | Extended with tool registration assertions |
| `docs/backlog/EP02-task-engine.md` | Modified | Status: PENDING -> IN_PROGRESS |
| `docs/tasks/0002-task-engine.md` | Created | Task specification |
| `docs/walkthroughs/0002-task-engine.md` | Created | This walkthrough |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| domain/task-status | 23 | 23 | - |
| domain/task-record | 12 | 12 | - |
| persistence/connection | 6 | 6 | - |
| persistence/task-repository | 18 | 18 | - |
| persistence/orchestrator-repository | 5 | 5 | - |
| persistence/event-repository | 5 | 5 | - |
| persistence/lease-repository | 11 | 11 | - |
| orchestrator/state-machine | 11 | 11 | - |
| orchestrator/lease-manager | 9 | 9 | - |
| tools/task-create | 6 | 6 | - |
| tools/task-get | 3 | 3 | - |
| tools/task-search | 5 | 5 | - |
| tools/task-update | 4 | 4 | - |
| tools/task-transition | 4 | 4 | - |
| index (plugin) | 6 | 6 | - |
| **Total** | **128** | **128** | - |

---

## Follow-ups

- EP03: Role execution workflow logic (blocked on EP02 -- now unblocked)
- EP04: GitHub integration for VCS operations (blocked on EP02 -- now unblocked)
- EP05: Quality & observability (blocked on EP02 and EP03)
- Consider adding ESLint rules for product-team package (currently `echo 'no lint rules yet'`)
- Consider adding coverage measurement to product-team tests

---

## Code Review Fixes (PR #161)

Addressed findings from independent code review:

| # | Severity | Fix |
|---|----------|-----|
| 1 | MUST_FIX | Moved all reads inside `db.transaction()` in `state-machine.ts` to prevent TOCTOU race |
| 2 | MUST_FIX | Wrapped `lease-repository.ts` `acquire()` in `db.transaction()` to prevent check-then-act race |
| 3 | SHOULD_FIX | Replaced unsafe `as string` cast with `typeof` check for `pluginConfig.dbPath` in `index.ts` |
| 5 | SHOULD_FIX | Short-circuit empty updates in `task-update.ts` to avoid spurious `rev` increments |
| 7+8 | SHOULD_FIX | Removed `!` non-null assertions in `state-machine.ts` by returning from transaction directly; added explicit null check for orchestrator state |
| 10 | SHOULD_FIX | Derived status unions in TypeBox schemas from `ALL_STATUSES` source of truth |
| 12 | SHOULD_FIX | Wrapped event log inside task creation transaction in `task-create.ts` for atomicity |

Items deferred (acceptable risk or future refactor):
- #4 (unconstrained generic in validator) -- deferred to future type-safety pass
- #6 (concrete deps instead of interfaces) -- deferred to interface extraction refactor
- #9 (lease check in task.update) -- deferred to EP03 when lease enforcement is finalized
- #11 (db.close lifecycle) -- deferred until OpenClaw plugin SDK adds lifecycle hooks
- #13-18 (NITs) -- accepted as-is or deferred

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
