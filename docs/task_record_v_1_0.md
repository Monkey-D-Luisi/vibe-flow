# TaskRecord v1.0.0 — Schema and MCP (EP01‑T01)

This document defines the **TaskRecord** contract, SQLite storage, and **Task MCP** resources/actions for orchestration. It includes JSON Schema, DDL, MCP tool contracts, and examples.

---

## 1) Decisions (ADR‑TR‑001, summary)
- **Identity**: `ULID` with `TR-` prefix, e.g. `TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C`. Time-sortable and safe for offline merges.
- **Architecture**: **Hexagonal**. Domain (TaskRecord) decoupled from persistence (SQLite) and exposure (MCP Tools).
- **Concurrency**: `rev` field (integer) for **optimistic** control. Updates require `if_rev=rev_current`.
- **States**: `po | arch | dev | review | po_check | qa | pr | done`. Transitions validated by minimal rules.
- **TDD Evidence**: `red_green_refactor_log[]` field mandatory in transitions to `review`.
- **Metrics**: `metrics.coverage ∈ [0,1]`, `lint.errors ≥ 0`, aggregated complexity.

---

## 2) JSON Schema (taskrecord.schema.json)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/taskrecord.schema.json",
  "title": "TaskRecord",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id", "title", "acceptance_criteria", "scope", "status", "rev",
    "created_at", "updated_at"
  ],
  "properties": {
    "version": {"type": "string", "const": "1.0.0"},
    "id": {
      "type": "string",
      "pattern": "^TR-[0-9A-HJKMNP-TV-Z]{26}$",
      "description": "ULID con prefijo TR-"
    },
    "title": {"type": "string", "minLength": 5, "maxLength": 120},
    "description": {"type": "string", "maxLength": 4000},
    "acceptance_criteria": {
      "type": "array", "minItems": 1, "items": {"type": "string", "minLength": 3, "maxLength": 300}
    },
    "scope": {"type": "string", "enum": ["minor", "major"]},
    "modules": {
      "type": "array", "items": {"type": "string", "pattern": "^[a-z][a-z0-9_\-]*(/[a-z0-9_\-]+)*$"}, "uniqueItems": true
    },
    "contracts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "methods"],
        "properties": {
          "name": {"type": "string", "pattern": "^[A-Z][A-Za-z0-9]+$"},
          "methods": {"type": "array", "minItems": 1, "items": {"type": "string"}}
        },
        "additionalProperties": false
      }
    },
    "patterns": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": {"type": "string"},
          "where": {"type": "string"},
          "why": {"type": "string"}
        },
        "additionalProperties": false
      }
    },
    "adr_id": {"type": "string", "pattern": "^ADR-\\d{3,}$"},
    "test_plan": {"type": "array", "items": {"type": "string"}},
    "branch": {"type": "string", "pattern": "^feature/[a-z0-9._-]+$"},
    "diff_summary": {"type": "string"},
    "review_notes": {"type": "array", "items": {"type": "string"}},
    "qa_report": {
      "type": "object",
      "required": ["total", "passed", "failed"],
      "properties": {
        "total": {"type": "integer", "minimum": 0},
        "passed": {"type": "integer", "minimum": 0},
        "failed": {"type": "integer", "minimum": 0}
      },
      "additionalProperties": false
    },
    "metrics": {
      "type": "object",
      "properties": {
        "coverage": {"type": "number", "minimum": 0, "maximum": 1},
        "complexity": {"type": "object", "additionalProperties": {"type": "number", "minimum": 0}},
        "lint": {
          "type": "object",
          "properties": {"errors": {"type": "integer", "minimum": 0}, "warnings": {"type": "integer", "minimum": 0}},
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "red_green_refactor_log": {"type": "array", "items": {"type": "string"}},
    "status": {"type": "string", "enum": ["po","arch","dev","review","po_check","qa","pr","done"]},
    "rounds_review": {"type": "integer", "minimum": 0},
    "links": {
      "type": "object",
      "properties": {
        "github": {"type": "object", "properties": {"owner": {"type": "string"}, "repo": {"type": "string"}, "issueNumber": {"type": "integer"}}, "additionalProperties": false},
        "git": {"type": "object", "properties": {"repo": {"type": "string"}, "branch": {"type": "string"}, "prNumber": {"type": "integer"}}, "additionalProperties": false},
        "adr_url": {"type": "string", "format": "uri"}
      },
      "additionalProperties": false
    },
    "tags": {"type": "array", "items": {"type": "string"}},
    "rev": {"type": "integer", "minimum": 0},
    "created_at": {"type": "string", "format": "date-time"},
    "updated_at": {"type": "string", "format": "date-time"}
  }
}
```

---

## 3) Minimal SQLite DDL (hexagonal: repo as port)
```sql
CREATE TABLE IF NOT EXISTS task_records (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL CHECK(scope IN ('minor','major')),
  status TEXT NOT NULL CHECK(status IN ('po','arch','dev','review','po_check','qa','pr','done')),
  adr_id TEXT,
  branch TEXT,
  coverage REAL DEFAULT 0 CHECK(coverage >= 0 AND coverage <= 1),
  lint_errors INTEGER DEFAULT 0 CHECK(lint_errors >= 0),
  lint_warnings INTEGER DEFAULT 0 CHECK(lint_warnings >= 0),
  rounds_review INTEGER DEFAULT 0,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  qa_report_json TEXT NOT NULL DEFAULT '{}',
  acceptance_json TEXT NOT NULL DEFAULT '[]',
  modules_json TEXT NOT NULL DEFAULT '[]',
  contracts_json TEXT NOT NULL DEFAULT '[]',
  patterns_json TEXT NOT NULL DEFAULT '[]',
  review_notes_json TEXT NOT NULL DEFAULT '[]',
  test_plan_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  links_json TEXT NOT NULL DEFAULT '{}',
  diff_summary TEXT,
  red_green_refactor_json TEXT NOT NULL DEFAULT '[]',
  rev INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_status ON task_records(status);
CREATE INDEX IF NOT EXISTS idx_task_scope  ON task_records(scope);
```

---

## 4) MCP Tools Contract (Task MCP)
### 4.1 Tools
```json
[
  {
    "name": "task.create",
    "description": "Create TaskRecord in initial state",
    "input_schema": {
      "type": "object",
      "required": ["title","acceptance_criteria","scope"],
      "properties": {
        "title": {"type":"string"},
        "description": {"type":"string"},
        "acceptance_criteria": {"type":"array","items":{"type":"string"}},
        "scope": {"type":"string","enum":["minor","major"]},
        "links": {"type":"object"},
        "tags": {"type":"array","items":{"type":"string"}}
      }
    },
    "output_schema": {"$ref": "#/TaskRecordRef"}
  },
  {
    "name": "task.get",
    "description": "Get TaskRecord by id",
    "input_schema": {"type": "object", "required": ["id"], "properties": {"id": {"type":"string"}}},
    "output_schema": {"$ref": "#/TaskRecordRef"}
  },
  {
    "name": "task.update",
    "description": "Update with optimistic control",
    "input_schema": {
      "type": "object",
      "required": ["id","if_rev","patch"],
      "properties": {
        "id": {"type":"string"},
        "if_rev": {"type":"integer"},
        "patch": {"type":"object"}
      }
    },
    "output_schema": {"$ref": "#/TaskRecordRef"}
  },
  {
    "name": "task.search",
    "description": "Search by text/status/labels",
    "input_schema": {
      "type": "object",
      "properties": {
        "q": {"type":"string"},
        "status": {"type":"array","items":{"type":"string"}},
        "labels": {"type":"array","items":{"type":"string"}},
        "limit": {"type":"integer","minimum":1,"maximum":200},
        "offset": {"type":"integer","minimum":0}
      }
    },
    "output_schema": {
      "type": "object",
      "properties": {"items": {"type":"array","items": {"$ref": "#/TaskRecordRef"}}, "total": {"type":"integer"}}
    }
  },
  {
    "name": "task.transition",
    "description": "State transition with minimal validations",
    "input_schema": {
      "type": "object",
      "required": ["id","to","if_rev"],
      "properties": {
        "id": {"type":"string"},
        "to": {"type":"string","enum":["po","arch","dev","review","po_check","qa","pr","done"]},
        "if_rev": {"type":"integer"},
        "evidence": {"type":"object"}
      }
    },
    "output_schema": {"$ref": "#/TaskRecordRef"}
  }
]
```

`#/TaskRecordRef` is an alias that points to `taskrecord.schema.json`.

### 4.2 Resource URIs
- `task://{id}` → Complete TaskRecord (GET/PUT)
- `task://search?q=...&status=dev` → paginated list
- `task://{id}/logs` → append entries to `red_green_refactor_log`

---

## 5) Minimal Transition Rules
- `dev → review`: requires `red_green_refactor_log.length ≥ 2` and `metrics.coverage ≥ 0.8` when `scope=major` (≥0.7 if `minor`).
- `review → dev`: increments `rounds_review` (max. 2).
- `review → po_check`: no `violations.high` pending.
- `po_check → qa`: acceptance criteria marked as met.
- `qa → pr`: `qa_report.failed = 0`.

---

## 6) Payload Examples
### 6.1 Create
```json
{
  "title": "Add user validation",
  "description": "As PO I want...",
  "acceptance_criteria": ["when invalid user → error 422"],
  "scope": "minor",
  "links": {"github": {"owner": "Monkey-D-Luisi", "repo": "agents-mcps", "issueNumber": 15}},
  "tags": ["area_architecture","agent_orchestrator"]
}
```

### 6.2 Update with optimistic control
```json
{
  "id": "TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C",
  "if_rev": 3,
  "patch": {
    "metrics": {"coverage": 0.83, "lint": {"errors": 0, "warnings": 2}},
    "red_green_refactor_log": ["red: 4 failing","green: all passing"]
  }
}
```

---

## 7) Tests (TDD)
### 7.1 Unit (suggested order)
1. **Validate schema**: reject invalid `branch`; accept valid `ULID`.
2. **Repo**: create→get→update with correct `rev`; update with obsolete `rev` returns `409`.
3. **Transitions**: `dev→review` fails without evidence; passes with log and sufficient coverage.
4. **Search**: `search(q="validation")` returns matches in `title` and `description`.

### 7.2 Contract (MCP)
- `task.create` returns valid `TaskRecord` and `rev=0`.
- `task.update` with `if_rev!=rev` → error `409`.
- `task.transition` applies rules and changes `updated_at`.

---

## 8) Definition of Done (EP01‑T01)
- JSON Schema versioned (`1.0.0`) published in repo schemas.
- SQLite with initial migration applied and `migrate up`/`down` script.
- Task MCP serving `task.create/get/update/search/transition` with schema validation.
- Unit and contract tests **green**. Coverage **≥80%** of Task module.
- Mini‑ADR (`ADR‑TR‑001`) saved and linked in `links.adr_url`.

---

## 9) Immediate Roadmap (suggested subtasks)
1) Implement **ULIDFactory** and **TaskValidator** (schema + rules).
2) Implement **TaskRepository** (SQLite) with `rev` optimistic.
3) Expose **MCP Tools** and `task://` resources.
4) **Tests** suite (unit + contract) and local CI.

