# TaskRecord v1.0.0 — Esquema y MCP (EP01‑T01)

Este documento define el contrato del **TaskRecord**, el almacenamiento en SQLite y los recursos/acciones del **Task MCP** para orquestación. Incluye JSON Schema, DDL, contratos de herramienta MCP y ejemplos de payloads y tests.

---

## 1) Decisiones (ADR‑TR‑001, resumen)
- **Identidad**: `ULID` con prefijo `TR-`, p.ej. `TR-01J8ZQ4Y7M5P2W3X4Y5Z6A7B8C`. Ordenable por tiempo y seguro para merges offline.
- **Arquitectura**: **Hexagonal**. Dominio (TaskRecord) desacoplado de persistencia (SQLite) y de exposición (MCP Tools).
- **Concurrencia**: campo `rev` (entero) para control **optimista**. Updates requieren `if_rev=rev_actual`.
- **Estados**: `po | arch | dev | review | po_check | qa | pr | done`. Transiciones validadas por reglas mínimas.
- **Evidencias TDD**: campo `red_green_refactor_log[]` obligatorio en transiciones a `review`.
- **Métricas**: `metrics.coverage ∈ [0,1]`, `lint.errors ≥ 0`, complejidad agregada.

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

## 3) SQLite DDL mínima (hexagonal: repo como puerto)
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

## 4) Contrato de herramientas MCP (Task MCP)
### 4.1 Tools
```json
[
  {
    "name": "task.create",
    "description": "Crear TaskRecord en estado inicial",
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
    "description": "Obtener TaskRecord por id",
    "input_schema": {"type": "object", "required": ["id"], "properties": {"id": {"type":"string"}}},
    "output_schema": {"$ref": "#/TaskRecordRef"}
  },
  {
    "name": "task.update",
    "description": "Actualizar con control optimista",
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
    "description": "Buscar por texto/estado/labels",
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
    "description": "Transición de estado con validaciones mínimas",
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

`#/TaskRecordRef` es un alias que apunta a `taskrecord.schema.json`.

### 4.2 URIs de recursos
- `task://{id}` → TaskRecord completo (GET/PUT)
- `task://search?q=...&status=dev` → lista paginada
- `task://{id}/logs` → anexar entradas a `red_green_refactor_log`

---

## 5) Reglas de transición mínimas
- `dev → review`: requiere `red_green_refactor_log.length ≥ 2` y `metrics.coverage ≥ 0.8` cuando `scope=major` (≥0.7 si `minor`).
- `review → dev`: incrementa `rounds_review` (máx. 2).
- `review → po_check`: sin `violations.high` pendientes.
- `po_check → qa`: criterios de aceptación marcados como cumplidos.
- `qa → pr`: `qa_report.failed = 0`.

---

## 6) Ejemplos de payloads
### 6.1 Crear
```json
{
  "title": "Añadir validación de usuario",
  "description": "Como PO quiero...",
  "acceptance_criteria": ["cuando usuario inválido → error 422"],
  "scope": "minor",
  "links": {"github": {"owner": "Monkey-D-Luisi", "repo": "agents-mcps", "issueNumber": 15}},
  "tags": ["area_architecture","agent_orchestrator"]
}
```

### 6.2 Update con control optimista
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

## 7) Pruebas (TDD)
### 7.1 Unit (orden sugerido)
1. **Valida esquema**: rechaza `branch` inválido; acepta `ULID` válido.
2. **Repo**: create→get→update con `rev` correcto; update con `rev` obsoleto devuelve `409`.
3. **Transiciones**: `dev→review` falla sin evidencia; pasa con log y cobertura suficiente.
4. **Búsqueda**: `search(q="validación")` devuelve coincidencias en `title` y `description`.

### 7.2 Contract (MCP)
- `task.create` devuelve `TaskRecord` válido y `rev=0`.
- `task.update` con `if_rev!=rev` → error `409`.
- `task.transition` aplica reglas y cambia `updated_at`.

---

## 8) Definition of Done (EP01‑T01)
- JSON Schema versionado (`1.0.0`) publicado en repo de esquemas.
- SQLite con migración inicial aplicada y script `migrate up`/`down`.
- Task MCP sirviendo `task.create/get/update/search/transition` con validación contra el schema.
- Tests unitarios y de contrato **verdes**. Cobertura **≥80%** del módulo Task.
- Mini‑ADR (`ADR‑TR‑001`) guardado y enlazado en `links.adr_url`.

---

## 9) Roadmap inmediato (subtareas sugeridas)
1) Implementar **ULIDFactory** y **TaskValidator** (schema + reglas).
2) Implementar **TaskRepository** (SQLite) con `rev` optimista.
3) Exponer **MCP Tools** y recursos `task://`.
4) Suite de **tests** (unit + contract) y CI local.

