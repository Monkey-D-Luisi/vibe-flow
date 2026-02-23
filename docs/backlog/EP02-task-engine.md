# EP02 -- Task Engine

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| Epic        | EP02                                             |
| Status      | PENDING                                          |
| Priority    | P0                                               |
| Phase       | 1 -- Foundation                                  |
| Target      | March 2026                                       |
| Depends on  | None                                             |
| Blocks      | EP03, EP04, EP05                                 |

## Goal

TaskRecord lifecycle with SQLite persistence, a strict state machine, an
append-only event log, and lease-based ownership. All task operations exposed as
OpenClaw tools.

## Context

The TaskRecord is the central domain object. Every piece of work flows through
a well-defined state machine: `backlog -> grooming -> design -> in_progress ->
in_review -> qa -> done`. Each transition is logged, and only the agent holding
the lease can mutate the task.

## Tasks

### 2.1 Plugin scaffold

- Create `extensions/product-team/` directory structure
- Set up `package.json`, `tsconfig.json`, `vitest.config.ts`
- Implement `src/index.ts` with plugin entry point
- Verify `pnpm test` passes with a smoke test

**Acceptance Criteria:**
- `pnpm test` passes in `extensions/product-team`
- Plugin exports a `register(api)` function

### 2.2 TaskRecord domain migration

- Port TaskRecord interface from old MCP server
- Define fields: id, title, status, scope, assignee, tags, metadata,
  created_at, updated_at
- Use ULID for IDs
- TypeBox schemas for validation

**Acceptance Criteria:**
- TaskRecord type is defined with all fields
- Schema validates correctly with sample data

### 2.3 SQLite persistence

- Set up better-sqlite3 connection with WAL mode
- Create migration system (version-tracked SQL files)
- Implement task_records table
- Implement event_log table
- Implement leases table
- CRUD operations: create, getById, search, update

**Acceptance Criteria:**
- Database created on first run
- All CRUD operations work with in-memory SQLite in tests
- WAL mode enabled

### 2.4 State machine and transitions

- Define valid transitions map
- Implement `transition(taskId, fromStatus, toStatus, agentId)` function
- Reject invalid transitions with descriptive errors
- Log every transition in event_log

**Acceptance Criteria:**
- Valid transitions succeed and are logged
- Invalid transitions throw with clear error messages
- State machine is the single source of truth

### 2.5 Event log and leases

- Event log: append-only, fields: id, task_id, event_type, agent_id, payload,
  created_at
- Leases: task_id, agent_id, acquired_at, expires_at
- Acquire lease: fail if another agent holds it
- Release lease: only the holder can release
- Auto-expire stale leases

**Acceptance Criteria:**
- Events cannot be deleted or updated
- Lease conflicts return clear errors
- Expired leases do not block acquisition

### 2.6 Tool registration

Register the following tools with the OpenClaw plugin API:

| Tool              | Description                              |
|-------------------|------------------------------------------|
| `task.create`     | Create a new TaskRecord                  |
| `task.get`        | Retrieve a TaskRecord by ID              |
| `task.search`     | Search tasks by status, assignee, tags   |
| `task.update`     | Update mutable fields on a TaskRecord    |
| `task.transition` | Transition task to a new state           |

**Acceptance Criteria:**
- All five tools registered successfully
- Each tool validates input with TypeBox schemas
- Each tool returns structured JSON responses

## Out of Scope

- Role-specific workflow logic (EP03)
- GitHub operations (EP04)
- Quality gate enforcement (EP05)

## References

- [Roadmap](../roadmap.md)
