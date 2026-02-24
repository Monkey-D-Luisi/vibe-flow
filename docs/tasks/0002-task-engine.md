# Task: 0002 -- Task Engine

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP02 |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-24 |
| Branch | `feat/0002-task-engine` |

---

## Goal

Implement the TaskRecord lifecycle with SQLite persistence, a strict state machine, an append-only event log, and lease-based ownership. All task operations exposed as OpenClaw tools.

---

## Context

The TaskRecord is the central domain object for the product-team plugin. Every piece of work flows through a well-defined state machine: `backlog -> grooming -> design -> in_progress -> in_review -> qa -> done`. Each transition is logged, and only the agent holding the lease can mutate the task. The plugin scaffold (task 2.1) already exists at `extensions/product-team/`.

---

## Scope

### In Scope

- TaskRecord domain model with TypeBox schemas (task 2.2)
- SQLite persistence with WAL mode, migrations, and 4 tables (task 2.3)
- State machine with valid transitions map (task 2.4)
- Event log and lease system (task 2.5)
- 5 OpenClaw tool registrations (task 2.6)

### Out of Scope

- Role-specific workflow logic (EP03)
- GitHub operations (EP04)
- Quality gate enforcement (EP05)

---

## Requirements

1. TaskRecord with ULID IDs, optimistic locking via `rev` field
2. Orchestrator state tracked separately from domain data
3. SQLite with WAL mode, foreign keys, parameterized queries
4. Strict state machine: only valid transitions allowed
5. Append-only event log for all state changes
6. Lease-based ownership preventing concurrent mutations
7. All 5 tools validate input via TypeBox schemas

---

## Acceptance Criteria

- [x] AC1: TaskRecord type defined with all fields including `rev`
- [x] AC2: Schema validates correctly with sample data
- [x] AC3: Concurrent updates with stale `rev` are rejected with conflict error
- [x] AC4: Database created on first run with WAL mode
- [x] AC5: All CRUD operations work with in-memory SQLite in tests
- [x] AC6: `orchestrator_state` row created atomically with each new TaskRecord
- [x] AC7: Valid transitions succeed and are logged
- [x] AC8: Invalid transitions throw with clear error messages
- [x] AC9: Events cannot be deleted or updated
- [x] AC10: Lease conflicts return clear errors
- [x] AC11: Expired leases do not block acquisition
- [x] AC12: All five tools registered successfully
- [x] AC13: Each tool validates input with TypeBox schemas
- [x] AC14: Each tool returns structured JSON responses

---

## Constraints

- TypeBox schemas for all validation
- Hexagonal architecture: Domain -> Persistence -> Orchestrator -> Tools
- ESM with `.js` extensions in imports
- No `any` types
- better-sqlite3 for SQLite access

---

## Implementation Steps

1. Create domain layer: errors, task-status, task-record
2. Create TypeBox schemas and validator
3. Create database connection and migrations
4. Create repositories with optimistic locking
5. Create event log and lease manager
6. Create state machine
7. Create 5 tool registrations
8. Wire up plugin entry point

---

## Testing Plan

- Unit tests: Domain logic (TaskRecord factory, state transitions)
- Integration tests: Persistence with in-memory SQLite (CRUD, optimistic locking, atomic creates)
- Tool tests: Full stack with in-memory SQLite

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [ ] Coverage meets threshold (>= 80% major)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] Code reviewed (PR #161)
- [x] PR created and linked (#161)
