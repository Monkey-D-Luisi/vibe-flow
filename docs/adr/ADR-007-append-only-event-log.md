# ADR-007: Append-Only Event Log for Audit Trail

## Status
Accepted

## Date
2026-02-24

## Context

The product-team extension manages task lifecycle across multiple agents. When
a task fails or a decision is questioned, operators need to know exactly what
happened: which agent transitioned the task, when, what the previous state was,
and what metadata accompanied the change.

Requirements:

- **Immutability:** Once written, an event must never be modified or deleted.
  This is critical for audit compliance and debugging.
- **Queryability:** Operators need to filter events by task, agent, event type,
  and time range.
- **Low overhead:** Events are written on every state transition and tool
  invocation — the write path must be fast.
- **Correlation:** Events must link back to the task that triggered them.

## Decision

Implement an **append-only event log** in SQLite with the following design:

1. A dedicated `event_log` table with columns: `id` (ULID), `task_id` (FK),
   `event_type`, `agent`, `data` (JSON), `timestamp`.
2. Events are never updated or deleted — INSERT only.
3. Foreign key constraint to `task_records(id)` ensures referential integrity.
4. The `workflow.events.query` tool exposes filtered reads over the event log.
5. Event types are enumerated: `state_change`, `quality_gate`, `decision`,
   `spawn`, `budget`, `error`, `message`.

## Alternatives Considered

### Mutable status fields on the task record

- **Pros:** Simpler schema — just update task fields.
- **Cons:** Loses history entirely. Cannot answer "what happened between
  IN_PROGRESS and FAILED?" or "how many times was this task retried?" State
  transition history is critical for debugging autonomous agent behavior.

### Structured log files (JSON lines)

- **Pros:** Zero schema overhead, append-fast.
- **Cons:** Cannot query by task ID or event type without parsing the entire
  file. No referential integrity. No transactional consistency with task
  state changes. Log rotation and retention require additional tooling.

### External event store (EventStoreDB, Kafka)

- **Pros:** Purpose-built for event sourcing with replay, projections, and
  subscriptions.
- **Cons:** Requires an external service — violates the local-first constraint.
  Massively over-provisioned for the volume of events (hundreds per day, not
  millions). Connection management adds operational overhead.

## Consequences

### Positive

- Complete audit trail of every action taken by every agent on every task.
- The `workflow.events.query` tool enables operators to diagnose issues without
  touching the database directly.
- Event data (JSON column) allows schema evolution without migrations — new
  event types add new JSON shapes.
- Append-only writes are fast in SQLite WAL mode — no lock contention with readers.

### Negative

- The event log grows unbounded. Without a retention policy, the database
  file will grow indefinitely. (Acceptable for current scale; retention
  policy deferred to a future epic.)
- JSON `data` column is opaque to SQLite queries — filtering by fields inside
  `data` requires `json_extract()` which cannot use indexes.

### Neutral

- The event log table doubles as the source of truth for pipeline metrics
  (EP09) and decision outcome tracking (EP12), avoiding the need for separate
  aggregation tables.

## References

- EP02 -- Task Engine (initial event log implementation)
- EP09 -- Pipeline Intelligence (event log as metrics source)
- EP12 -- Agent Learning Loop (decision outcome analysis over events)
- `extensions/product-team/src/persistence/` — event repository implementation
