# ADR-008: Lease-Based Task Ownership over Mutex Locking

## Status
Accepted

## Date
2026-02-24

## Context

Multiple agents may attempt to work on the same task simultaneously. Without
an ownership mechanism, two agents could both transition a task from
`IN_PROGRESS` to `REVIEW`, producing duplicate PRs or conflicting state
changes.

Requirements:

- **Exclusive ownership:** Only one agent can modify a task at a time.
- **Automatic recovery:** If an agent crashes or times out, the lock must
  be released automatically — no manual intervention.
- **No external dependencies:** The mechanism must work with SQLite only.
- **Audit trail:** Ownership changes must be logged for debugging.

## Decision

Implement **lease-based task ownership** where an agent acquires a time-limited
lease on a task before performing operations.

Design:

1. A `lease` column on `task_records` stores the lease holder (agent ID) and
   expiry timestamp.
2. `acquireLease(taskId, agentId, durationMs)` atomically sets the lease if
   no valid lease exists (expired or null).
3. `releaseLease(taskId, agentId)` explicitly clears the lease after work
   completes.
4. Lease expiry is checked on every task read — expired leases are treated
   as unowned.
5. Default lease duration: 5 minutes (configurable).

## Alternatives Considered

### Mutex / in-memory lock

- **Pros:** Simple, fast, well-understood.
- **Cons:** Locks are lost on process restart. If an agent crashes while
  holding a lock, the task is permanently locked until manual intervention.
  Does not survive plugin restarts.

### Database row-level locking (`SELECT FOR UPDATE`)

- **Pros:** Standard relational pattern.
- **Cons:** SQLite does not support `SELECT FOR UPDATE`. Would require
  PostgreSQL, which violates the local-first constraint. Even with
  PostgreSQL, row locks are held for the duration of a transaction — not
  suitable for leases that span multiple tool invocations over minutes.

### Optimistic concurrency (version column)

- **Pros:** No locks, works well for short operations.
- **Cons:** Task operations span multiple tool calls (transition → quality
  gate → commit → PR). Optimistic concurrency would require retrying the
  entire multi-step sequence on conflict, which is impractical for
  operations that take minutes.

## Consequences

### Positive

- Automatic recovery: crashed agents' leases expire naturally.
- No external dependencies: lease logic is pure SQLite.
- Audit trail: lease acquisitions and releases are logged in the event log.
- Configurable duration: different task types can use different lease times.

### Negative

- Lease expiry introduces a delay before recovery — a crashed agent's task
  is blocked for up to the lease duration (default 5 minutes).
- Clock skew between agents could cause premature lease expiry, though this
  is negligible in a single-host deployment.

### Neutral

- The lease mechanism integrates naturally with the state machine: lease
  checks are transition guards, not separate middleware.

## References

- EP02 -- Task Engine (lease implementation)
- EP06 -- Hardening (concurrency limits built on lease mechanism)
- `extensions/product-team/src/orchestrator/` — lease manager implementation
