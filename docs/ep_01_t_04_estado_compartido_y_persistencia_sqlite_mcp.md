# EP01‑T04 — Shared State and Persistence (SQLite + MCP)

> Objective: persist **TaskRecord** and **orchestrator state** in SQLite, expose them through a **State MCP** with concurrency control (optimistic + leases) and an **event journal**. Must integrate with the orchestrator, agents, and GitHub workflow.

---

## 1) Scope and Context
- Local source of truth for the PO → ARCH → DEV → REVIEW ↔ DEV → PO_CHECK → QA → PR → DONE cycle.
- Avoid race conditions between agents using **optimistic locking** (`rev`) and **temporary leases**.
- Save traces of handoffs and decisions in a queryable **event log**.
- Compatible with the already defined `TaskRecord v1.0.0`.

---

## 2) Models (JSON Schemas)
### 2.1 OrchestratorState (`orchestrator_state.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "OrchestratorState",
  "type": "object",
  "additionalProperties": false,
  "required": ["task_id","current","rev","updated_at"],
  "properties": {
    "task_id": {"type":"string","pattern":"^TR-[0-9A-HJKMNP-TV-Z]{26}$"},
    "current": {"type":"string","enum":["po","arch","dev","review","po_check","qa","pr","done"]},
    "previous": {"type":"string","enum":["po","arch","dev","review","po_check","qa","pr","done"]},
    "last_agent": {"type":"string","enum":["orchestrator","architect","dev","reviewer","qa","pr-bot","telemetry","po"]},
    "rounds_review": {"type":"integer","minimum":0},
    "rev": {"type":"integer","minimum":0},
    "updated_at": {"type":"string","format":"date-time"}
  }
}
```

### 2.2 Event (`event.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "StateEvent",
  "type": "object",
  "additionalProperties": false,
  "required": ["id","task_id","type","created_at"],
  "properties": {
    "id": {"type":"string","pattern":"^EV-[0-9A-HJKMNP-TV-Z]{26}$"},
    "task_id": {"type":"string","pattern":"^TR-[0-9A-HJKMNP-TV-Z]{26}$"},
    "type": {"type":"string","enum":["handoff","transition","comment","quality","error"]},
    "payload": {"type":"object","additionalProperties":true},
    "created_at": {"type":"string","format":"date-time"}
  }
}
```

### 2.3 Lease (`lease.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Lease",
  "type": "object",
  "additionalProperties": false,
  "required": ["task_id","lease_id","owner_agent","expires_at"],
  "properties": {
    "task_id": {"type":"string","pattern":"^TR-[0-9A-HJKMNP-TV-Z]{26}$"},
    "lease_id": {"type":"string","pattern":"^LE-[0-9A-HJKMNP-TV-Z]{26}$"},
    "owner_agent": {"type":"string"},
    "expires_at": {"type":"string","format":"date-time"}
  }
}
```

---

## 3) SQLite DDL
> Activate at startup: `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`

```sql
-- Main table already existing (expand if fields from schema v1.0.0 are missing)
CREATE TABLE IF NOT EXISTS task_records (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL CHECK(scope IN ('minor','major')),
  status TEXT NOT NULL CHECK(status IN ('po','arch','dev','review','po_check','qa','pr','done')),
  rev INTEGER NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  rgr_log_json TEXT NOT NULL DEFAULT '[]',
  acceptance_json TEXT NOT NULL DEFAULT '[]',
  modules_json TEXT NOT NULL DEFAULT '[]',
  contracts_json TEXT NOT NULL DEFAULT '[]',
  patterns_json TEXT NOT NULL DEFAULT '[]',
  qa_report_json TEXT NOT NULL DEFAULT '{}',
  review_notes_json TEXT NOT NULL DEFAULT '[]',
  diff_summary TEXT,
  links_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_status ON task_records(status);

-- Orchestrator state per Task
CREATE TABLE IF NOT EXISTS orchestrator_state (
  task_id TEXT PRIMARY KEY REFERENCES task_records(id) ON DELETE CASCADE,
  current TEXT NOT NULL CHECK(current IN ('po','arch','dev','review','po_check','qa','pr','done')),
  previous TEXT,
  last_agent TEXT,
  rounds_review INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Event journal
CREATE TABLE IF NOT EXISTS event_log (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES task_records(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_task ON event_log(task_id);
CREATE INDEX IF NOT EXISTS idx_event_created ON event_log(created_at);

-- Leases for exclusion
CREATE TABLE IF NOT EXISTS leases (
  task_id TEXT PRIMARY KEY REFERENCES task_records(id) ON DELETE CASCADE,
  lease_id TEXT NOT NULL,
  owner_agent TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leases_expires ON leases(expires_at);
```

---

## 4) State MCP Contract (tools)
> All tools validate inputs/outputs with AJV and return typed errors.

### 4.1 `state.get`
**Input**
```json
{ "id": "TR-...", "events_limit": 50 }
```
**Output**
```json
{ "task": {"...TaskRecord"}, "state": {"...OrchestratorState"}, "events": [{"...StateEvent"}] }
```
**Errors**: `404` if TR doesn't exist.

### 4.2 `state.patch`
**Input**
```json
{ "id": "TR-...", "if_rev": 3, "patch": { "task": {"status":"review","metrics":{"coverage":0.82}}, "state": {"current":"review","previous":"dev","last_agent":"dev"} } }
```
**Output**: Task + State updated with incremented `rev`.

**Rules**
- Requires **valid lease** or `force=true` only for maintenance.
- If `if_rev` ≠ current `rev` → **409**.

### 4.3 `state.acquire_lock`
**Input**
```json
{ "id": "TR-...", "owner":"reviewer", "ttl_s": 90 }
```
**Output**
```json
{ "lease_id":"LE-...", "expires_at":"2025-10-07T12:34:56Z" }
```
**Rules**
- If unexpired lease exists with different owner → **423**.
- If expired, **replaced** by the new one.

### 4.4 `state.release_lock`
**Input**
```json
{ "id": "TR-...", "lease_id": "LE-..." }
```
**Output**: `{ "released": true }` or **409** if lease_id doesn't match.

### 4.5 `state.append_event`
**Input**
```json
{ "id":"TR-...", "type":"handoff", "payload": { "from":"dev", "to":"review", "by":"orchestrator" } }
```
**Output**: `{ "id":"EV-..." }`

### 4.6 `state.search`
**Input**
```json
{ "q":"coverage", "status":["dev","review"], "limit": 20, "offset": 0 }
```
**Output**
```json
{ "items":[ {"task":{"id":"TR-...","title":"..."}, "state":{"current":"dev"} } ], "total": 1 }
```

---

## 5) Concurrency: usage algorithm
**Before executing an agent** on a TR:
1. `state.acquire_lock(id, owner=agent, ttl_s=90)`
2. Read snapshot: `state.get(id)`
3. Execute agent → produce `patch`
4. `state.patch(id, if_rev=snapshot.task.rev, patch)`
5. `state.append_event(...)`
6. `state.release_lock(id, lease_id)`

**Collisions**
- 409: read again and retry with fresh `rev`.
- 423: wait for lease to expire or abort if owner ≠ expected.

---

## 6) Integration with orchestrator and GitHub
- The orchestrator's **runner** adopts the previous pattern and doesn't touch SQLite directly.
- On each successful `transition`, publish an `event` and, if applicable, comment on the linked PR (`links.git.prNumber`).
- If a quality gate fails, tag `quality_gate_failed` and revert to `dev` via `state.patch`.

---

## 7) Dev API (optional HTTP for development)
> For local testing while integrating with your MCP framework.

**POST** `/mcp/state`
```json
{ "tool": "state.get", "input": {"id":"TR-..."} }
```
Responds `{ ok: true, result: {...} }` or `{ ok:false, error:{ code:409|423|404, message:"..." } }`.

---

## 8) Tests (TDD)
- **Locking**: two simultaneous "agents", the second gets 423 until it expires or is released.
- **Optimistic**: `state.patch` with obsolete `if_rev` returns 409.
- **Journal**: each handoff writes an event with correct `type` and temporal order.
- **Search**: filters by text and status; pages correctly.
- **Resilience**: lease expiration mid-process allows another agent to continue.

---

## 9) Definition of Done
- DDL applied and reproducible migrations.
- Schemas `orchestrator_state`, `event`, `lease` published in `packages/schemas/`.
- Tools `state.get/patch/acquire_lock/release/append_event/search` implemented with AJV validation.
- Orchestrator runner uses **lease + patch**.
- Suite of green tests (locking, optimistic, journal, search).
- Docs in README with usage examples.

---

## 10) Suggested Subtasks
1) Create SQLite migrations and initialization with PRAGMAs.
2) Implement repos (`StateRepository`, `EventRepository`, `LeaseRepository`).
3) Expose MCP tools and validations.
4) Integrate in orchestrator's `runner.ts` (acquire/patch/release + append_event).
5) Unit and integration tests.
6) Optional hook to comment on PR when writing relevant events.

