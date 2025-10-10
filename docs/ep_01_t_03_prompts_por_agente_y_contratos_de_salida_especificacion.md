# EP01‑T03 — Prompts por agente y contratos de salida

> Objetivo: definir instrucciones de sistema por agente, sus entradas/salidas tipadas y criterios de evaluación para que el orquestador pueda encadenar handoffs sin ambigüedad ni creatividad fuera de rango.

## Agentes y responsabilidades
- **orchestrator**: planifica, enruta y valida handoffs; aplica fast‑track si `scope=minor`.
- **po**: define objetivo, criterios de aceptación, prioridades y restricciones (seguridad, performance, privacidad).
- **architect**: produce `design_ready` (módulos, contratos, patrones, test_plan), registra ADRs.
- **dev**: implementa con TDD; entrega `diff_summary`, `red_green_refactor_log` y actualiza métricas.
- **reviewer**: ejecuta rúbrica SOLID/Clean Code/Patrones y emite `violations`.
- **qa**: ejecuta plan unit/contract/smoke; produce `qa_report` y evidencias.
- **pr-bot**: crea rama, commits gated por tests, y PR con checklist.
- **telemetry**: traza handoffs y métricas.

## Contratos de E/S por agente
### 1) PO → `po.brief`
**Input:**
```json
{
  "title": "string",
  "description": "string",
  "acceptance_criteria": ["string"],
  "scope": "minor|major",
  "constraints": {"security": ["string"], "performance": ["string"], "privacy": ["string"]}
}
```
**Output (`po_brief.json`)**
```json
{
  "title": "string",
  "acceptance_criteria": ["string"],
  "scope": "minor|major",
  "non_functional": ["string"],
  "done_if": ["string"]
}
```

### 2) Arquitectura → `architect.design_ready`
**Output:**
```json
{
  "modules": ["string"],
  "contracts": [{"name": "PascalCase", "methods": ["string"]}],
  "patterns": [{"name": "string", "where": "string", "why": "string"}],
  "adr_id": "ADR-\d+",
  "test_plan": ["string"]
}
```

### 3) Dev → `dev.work_output`
```json
{
  "diff_summary": "string",
  "metrics": {"coverage": 0.0, "lint": {"errors": 0, "warnings": 0}},
  "red_green_refactor_log": ["string"]
}
```

### 4) Reviewer → `reviewer.report`
```json
{
  "violations": [{"rule": "string", "where": "string", "why": "string", "severity": "low|med|high", "suggested_fix": "string"}],
  "summary": "string"
}
```

### 5) QA → `qa.report`
```json
{
  "total": 0,
  "passed": 0,
  "failed": 0,
  "evidence": ["string"]
}
```

### 6) PR Bot → `pr.summary`
```json
{
  "branch": "feature/[a-z0-9._-]+",
  "pr_url": "https://...",
  "checklist": ["string"]
}
```

## Instrucciones de sistema (resumen)
> Todas con `temperature: 0` y `guardrails` para **no inventar campos** ni salirse del JSON esperado.

**po.system**
- Objetivo: destilar requisitos claros y criterios de aceptación accionables.
- Salida estricta: `po_brief.json`.

**architect.system**
- Objetivo: entregar `design_ready` autoexplicativo con patrones y trade‑offs.
- Normas: preferir patrones GoF/DDD; justificar con `why`; ADR obligatorio.

**dev.system**
- Objetivo: TDD puro; primero tests, luego implementación; reportar `metrics` y `rgr_log`.
- Normas: SOLID, Clean Code, evitar acoplamientos, funciones pequeñas.

**reviewer.system**
- Objetivo: evaluar con rúbrica y severidades; bloquear con `high`.
- Normas: cada violación debe proponer `suggested_fix`.

**qa.system**
- Objetivo: ejecutar plan definido por arquitectura; registrar evidencia.

**pr-bot.system**
- Objetivo: crear PR con checklist de criterios, ADR, QA, métricas y vínculo a issue.

## Validaciones automáticas por herramienta
- `dev.work_output`: `coverage ≥ 0.8` si `scope=major`, `≥ 0.7` si `minor`; `lint.errors = 0`.
- `reviewer.report`: sin `severity=high` para pasar a `po_check`.
- `qa.report`: `failed = 0` para pasar a `pr`.

## Tests de contrato
- Dada una entrada mínima por agente, el parser valida que el JSON de salida **cumple el schema** y no trae campos extra.
- Snapshot tests de prompts para evitar drift.

## DoD (EP01‑T03)
- Esquemas `po_brief.json`, `design_ready.json`, `dev_work_output.json`, `reviewer_report.json`, `qa_report.json`, `pr_summary.json` publicados en `packages/schemas/`.
- Tests de contrato por agente en `services/task-mcp/test/agents.contract.spec.ts`.
- Orquestador capaz de rutear y validar cada handoff usando estos contratos.

