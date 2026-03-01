# ADR-002: SQLite for TaskRecord persistence via `better-sqlite3`

## Status
Accepted

## Date
2026-02-27

## Context

The product-team plugin requires durable storage for several relational entities:
TaskRecords (title, status, scope, assignee, metadata, rev), orchestrator state
(current/previous workflow phase, review round counter), an append-only event
log, lease records for concurrent agent ownership, and idempotency keys that
prevent duplicate GitHub operations.

The plugin runs as an in-process OpenClaw extension on a single host, not as a
multi-region service. Key requirements were:

- **Durability.** Data must survive plugin restarts. In-memory state would lose
  all task history on any crash or redeploy.
- **Relational integrity.** Orchestrator state and event log rows reference
  `task_records(id)` with foreign-key constraints.
- **Concurrent access.** Multiple agents can work on different tasks
  simultaneously. Writes need serialisation and stale-lease expiry must be
  atomic.
- **Zero operational overhead.** The plugin must start without provisioning an
  external database server. Adding PostgreSQL or MySQL would require a running
  server process, connection pooling, and credentials management.
- **Synchronous query model.** The step runner and state machine execute
  synchronous validation logic. An async query layer (pg, mysql2) would
  complicate every state-machine guard that reads from the DB.

## Decision

Use **SQLite** (`better-sqlite3`) as the persistence layer.

Specifically:

1. Open the database at a configured `dbPath` (defaults to
   `~/.openclaw/product-team.db`).
2. Enable `WAL` journal mode for concurrent read/write throughput without
   reader–writer contention.
3. Enable `foreign_keys = ON` to enforce referential integrity at the DB level.
4. Set `busy_timeout = 5000` so that concurrent writers retry rather than fail
   immediately on a locked database page.
5. Run migrations at plugin startup via a versioned `schema_version` table so
   that schema changes are applied automatically.

## Alternatives Considered

### In-memory store (plain JavaScript Map/object)

- **Pros:** Zero dependencies, instant reads.
- **Cons:** No durability. All task history is lost on restart or crash.
  Disqualified because task lifecycle spans hours to days.

### PostgreSQL / MySQL

- **Pros:** Full relational database with replication, rich tooling.
- **Cons:** Requires a running server process external to the plugin.
  Significantly increases operational burden for what is currently a
  single-host deployment. Connection management and async queries complicate
  the synchronous state-machine guards.

### LowDB / JSON file store

- **Pros:** No SQL, human-readable storage.
- **Cons:** No transactions, no concurrent write safety, no foreign-key
  constraints. Corruption risk on concurrent writes.

### `node-sqlite3` (async binding)

- **Pros:** Same SQLite file format.
- **Cons:** All queries are callback/Promise-based, which requires await at
  every state-machine read point. `better-sqlite3` offers synchronous queries
  with no async overhead, which is a better fit for the synchronous state
  machine and lease guard logic.

## Consequences

### Positive

- **Durability without a server.** SQLite persists data to disk with full ACID
  guarantees and uses WAL mode so that readers never block writers.
- **Zero provisioning.** No external server, no credentials, no connection
  pooling. The DB file is created automatically on first run.
- **Synchronous API.** `better-sqlite3` exposes synchronous `prepare/get/run`
  calls that fit naturally inside the state-machine guards and lease manager.
- **Referential integrity.** Foreign-key constraints catch orphan rows at the
  database level.

### Negative

- **Single-host only.** SQLite does not support network access or
  multi-host write concurrency. If the system moves to a multi-node
  deployment, a client–server database will be needed.
- **File-path configuration.** The `dbPath` must be writable by the plugin
  process. Misconfigured paths produce hard-to-diagnose startup errors.

### Neutral

- **WAL mode.** Enables concurrent reads alongside a writer but consumes
  marginally more disk space for the WAL file. Acceptable at current scale.

## References

- `extensions/product-team/src/persistence/connection.ts`
- `extensions/product-team/src/persistence/migrations.ts`
- [better-sqlite3 documentation](https://github.com/WiseLibs/better-sqlite3)
- [Roadmap EP02 — Task Engine](../backlog/EP02-task-engine.md)
