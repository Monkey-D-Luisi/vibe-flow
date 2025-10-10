# EP01‑T02 — Grafo de estados y handoffs

## Objetivo
Definir la máquina de estados del flujo PO → Arquitectura → Dev → Review ↔ Dev → PO Check → QA → PR y las reglas que la gobiernan, incluyendo fast‑track para `scope=minor`, límites de rondas y verificación de puertas (quality MCP, rúbrica reviewer, QA report).

## Estados
`po`, `arch`, `dev`, `review`, `po_check`, `qa`, `pr`, `done`

## Eventos
`design_ready`, `implement_ready`, `review_ok`, `review_changes`, `po_approved`, `qa_pass`, `qa_fail`, `pr_opened`, `merged`

## Transiciones
- `po → arch` on backlog grooming o si `scope=major`. Guard: requisitos mínimos definidos.
- `po → dev` fast‑track si `scope=minor` y sin cambios de diseño.
- `arch → dev` on `design_ready` (ADR y contratos definidos).
- `dev → review` guard: `red_green_refactor_log ≥ 2`, `coverage ≥ umbral` (0.8 major, 0.7 minor), `lint.errors=0`.
- `review → dev` on `review_changes`. Efecto: `rounds_review++` (máx 2).
- `review → po_check` on `review_ok`. Guard: sin `violations.high` en rúbrica.
- `po_check → qa` on `po_approved`. Guard: criterios de aceptación marcados.
- `qa → dev` on `qa_fail` (adjuntar reporte).
- `qa → pr` on `qa_pass`.
- `pr → done` on `merged`.

## Representación JSON (statechart)
```json
{
  "initial": "po",
  "states": {
    "po": { "on": { "GROOMED": "arch", "FAST_TRACK": "dev" } },
    "arch": { "on": { "DESIGN_READY": "dev" } },
    "dev": { "on": { "SUBMIT_REVIEW": "review" } },
    "review": { "on": { "CHANGES": "dev", "APPROVED": "po_check" } },
    "po_check": { "on": { "APPROVED": "qa" } },
    "qa": { "on": { "FAIL": "dev", "PASS": "pr" } },
    "pr": { "on": { "MERGED": "done" } },
    "done": { "type": "final" }
  }
}
```

## Guards y efectos (pseudocódigo)
- Guard `ready_for_review(tr)`:
  - `len(tr.red_green_refactor_log) ≥ 2`
  - `tr.metrics.coverage ≥ (tr.scope == 'major' ? 0.8 : 0.7)`
  - `lint.errors == 0`
- Efecto `inc_rounds_review(tr)`: `tr.rounds_review += 1` y si `> 2` → bloquear.

## API MCP — tool `task.transition`
Entrada:
```json
{
  "id": "TR-...",
  "to": "review",
  "if_rev": 3,
  "evidence": {
    "metrics": {"coverage": 0.82, "lint": {"errors": 0, "warnings": 2}},
    "red_green_refactor_log": ["red: 4 failing", "green: all passing"],
    "qa_report": {"total": 32, "passed": 32, "failed": 0},
    "violations": []
  }
}
```
Salida: TaskRecord actualizado o error `409` si `rev` desactualizado.

## Integraciones de puerta
- **Quality MCP**: antes de `dev → review` calcula cobertura, lint y complejidad. Umbrales configurables.
- **Reviewer**: genera `violations[]` con severidad. No se permite `high` para pasar a `po_check`.
- **QA**: ejecuta plan unit/contract/smoke; si `failed > 0` retorna a `dev`.

## Límite de rondas
- `review ↔ dev`: máx 2 rondas por TaskRecord. Superado el límite, requiere intervención del PO.

## Telemetría y trazas
- Guardar en `links.jira.issueKey` y `links.git.branch` cuando existan.
- Emitir evento `handoff` {from, to, when, tr_id} para observabilidad.

## DoD (EP01‑T02)
- Statechart serializable (`statechart.json`) y validado en tests.
- Implementación de `task.transition` con guards activos.
- Tests de transición y de límites de ronda.
- Documentación de fast‑track y umbrales por scope.

