# EP01‑T03 — Prompts por agente y contratos de salida

> Objetivo: definir instrucciones de sistema por agente, sus entradas/salidas tipadas y criterios de evaluación para que el orquestador pueda encadenar handoffs sin ambigüedad ni creatividad fuera de rango.

## Agentes y responsabilidades

* **orchestrator**: planifica, enruta y valida handoffs; aplica fast‑track si `scope=minor`.
* **po**: define objetivo, criterios de aceptación, prioridades y restricciones (seguridad, performance, privacidad).
* **architect**: produce `design_ready` (módulos, contratos, patrones, test_plan), registra ADRs.
* **dev**: implementa con TDD; entrega `diff_summary`, `red_green_refactor_log` y actualiza métricas.
* **reviewer**: ejecuta rúbrica SOLID/Clean Code/Patrones y emite `violations`.
* **qa**: ejecuta plan unit/contract/smoke; produce `qa_report` y evidencias.
* **pr-bot**: crea rama, commits gated por tests, y PR con checklist.
* **telemetry**: traza handoffs y métricas.

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

* Objetivo: destilar requisitos claros y criterios de aceptación accionables.
* Salida estricta: `po_brief.json`.

**architect.system**

* Objetivo: entregar `design_ready` autoexplicativo con patrones y trade‑offs.
* Normas: preferir patrones GoF/DDD; justificar con `why`; ADR obligatorio.

**dev.system**

* Objetivo: TDD puro; primero tests, luego implementación; reportar `metrics` y `rgr_log`.
* Normas: SOLID, Clean Code, evitar acoplamientos, funciones pequeñas.

**reviewer.system**

* Objetivo: evaluar con rúbrica y severidades; bloquear con `high`.
* Normas: cada violación debe proponer `suggested_fix`.

**qa.system**

* Objetivo: ejecutar plan definido por arquitectura; registrar evidencia.

**pr-bot.system**

* Objetivo: crear PR con checklist de criterios, ADR, QA, métricas y vínculo a issue.

## Validaciones automáticas por herramienta

* `dev.work_output`: `coverage ≥ 0.8` si `scope=major`, `≥ 0.7` si `minor`; `lint.errors = 0`.
* `reviewer.report`: sin `severity=high` para pasar a `po_check`.
* `qa.report`: `failed = 0` para pasar a `pr`.

## Tests de contrato

* Dada una entrada mínima por agente, el parser valida que el JSON de salida **cumple el schema** y no trae campos extra.
* Snapshot tests de prompts para evitar drift.

## DoD (EP01‑T03)

* Esquemas `po_brief.json`, `design_ready.json`, `dev_work_output.json`, `reviewer_report.json`, `qa_report.json`, `pr_summary.json` publicados en `packages/schemas/`.
* Tests de contrato por agente en `services/task-mcp/test/agents.contract.spec.ts`.
* Orquestador capaz de rutear y validar cada handoff usando estos contratos.

---

## Instrucciones de implementación

> Sí, faltaban las instrucciones paso a paso. Aquí tienes la receta completa para que el orquestador y los agentes funcionen sin improvisar.

### 1) Estructura de ficheros

```
packages/schemas/
  po_brief.schema.json
  design_ready.schema.json
  dev_work_output.schema.json
  reviewer_report.schema.json
  qa_report.schema.json
  pr_summary.schema.json
services/task-mcp/
  src/agents/
    po.ts            # prompt + validación salida
    architect.ts     # prompt + validación salida
    dev.ts           # prompt + validación salida
    reviewer.ts      # prompt + validación salida
    qa.ts            # prompt + validación salida
    prbot.ts         # prompt + validación salida
  src/orchestrator/
    router.ts        # decide siguiente agente según estado/scope
    runner.ts        # ejecuta agente (Agent Builder / API) y valida contra schema
    mappers.ts       # mapea salida → TaskRecord.patch
  test/agents.contract.spec.ts
```

### 2) Schemas de salida (coloca en `packages/schemas/`)

> Ya están definidos arriba en “Contratos de E/S”. Cópialos 1:1 a ficheros `.schema.json` y versiónalos.

* `po_brief.schema.json`, `design_ready.schema.json`, `dev_work_output.schema.json`, `reviewer_report.schema.json`, `qa_report.schema.json`, `pr_summary.schema.json`.
* Añade `"additionalProperties": false` en todos para evitar inventos.

### 3) Templates de prompts por agente

> Usa **temperature: 0** y **response_format estricto**. Si usas Agent Builder, define cada agente con su system prompt y el schema como “tool output”.

**`src/agents/dev.ts` (extracto del prompt)**

```
Eres el agente DEV. Escribe primero tests (TDD), luego implementación. No inventes campos.
Salida obligatoria: JSON válido que cumpla `dev_work_output.schema.json`.
Reglas:
- Aplica SOLID y Clean Code.
- coverage ≥ 0.8 (major) | ≥ 0.7 (minor)
- lint.errors = 0
- Incluye `red_green_refactor_log` con al menos 2 entradas (red→green).
```

**`src/agents/reviewer.ts`**

```
Eres el agente REVIEWER. Evalúas la entrega con la rúbrica SOLID/Patrones.
Salida: `reviewer_report.schema.json`
Reglas:
- Cada violación incluye rule, where, why, severity y suggested_fix.
- No permitas pasar a PO_CHECK si existe severity = "high".
```

**`src/agents/architect.ts`**

```
Eres el agente ARQUITECTO. Entregas `design_ready` con módulos, contratos, patrones y ADR.
Salida: `design_ready.schema.json`. Justifica patrones en `why`.
```

**`src/agents/qa.ts`**

```
Eres QA. Ejecutas plan unit/contract/smoke.
Salida: `qa_report.schema.json` con failed=0 para aprobar.
```

**`src/agents/prbot.ts`**

```
Eres PR-BOT. Creas rama, PR draft y checklist de validación.
Salida: `pr_summary.schema.json` (branch, pr_url, checklist[]).
```

### 4) Runner y validación

**`src/orchestrator/runner.ts` (pseudocódigo)**

```ts
import Ajv from "ajv";
import { callAgent } from "../vendor/agent-builder.js"; // wrapper a OpenAI Agent Builder

export async function runAgent({agent, input, schemaPath}) {
  const out = await callAgent(agent, input); // devuelve string JSON
  const json = JSON.parse(out);
  const validate = new Ajv({allErrors:true, strict:false}).compile(require(schemaPath));
  if (!validate(json)) throw new Error("SchemaError:"+JSON.stringify(validate.errors));
  return json;
}
```

### 5) Router

**`src/orchestrator/router.ts`**

```ts
import { TaskRecord } from "../domain/TaskRecord";
export function nextAgent(tr: TaskRecord){
  if (tr.status === "po" && tr.scope === "minor") return "dev"; // fast‑track
  if (tr.status === "po") return "architect";
  if (tr.status === "arch") return "dev";
  if (tr.status === "dev") return "reviewer";
  if (tr.status === "review") return "po_check";
  if (tr.status === "po_check") return "qa";
  if (tr.status === "qa") return "prbot";
  return null;
}
```

### 6) Mapeo de salida → TaskRecord.patch

**`src/orchestrator/mappers.ts`**

```ts
export function mapDev(out){
  return { metrics: out.metrics, red_green_refactor_log: out.red_green_refactor_log, diff_summary: out.diff_summary };
}
export function mapReviewer(out){ return { review_notes: out.violations, }; }
export function mapQA(out){ return { qa_report: { total: out.total, passed: out.passed, failed: out.failed } }; }
export function mapArchitect(out){ return { modules: out.modules, contracts: out.contracts, patterns: out.patterns, adr_id: out.adr_id, test_plan: out.test_plan } }
export function mapPR(out){ return { branch: out.branch, links: { git: { prUrl: out.pr_url } } } }
```

### 7) Pruebas de contrato (Vitest)

**`test/agents.contract.spec.ts`**

```ts
import { runAgent } from "../src/orchestrator/runner";
import poBrief from "../../packages/schemas/po_brief.schema.json";
// ...carga del resto de schemas

it("dev cumple schema y umbrales", async () => {
  const out = await runAgent({ agent: "dev", input: { /* brief */ }, schemaPath: "packages/schemas/dev_work_output.schema.json" });
  expect(out.metrics.coverage).toBeGreaterThanOrEqual(0.7);
  expect(out.red_green_refactor_log.length).toBeGreaterThanOrEqual(2);
});
```

### 8) Integración con GitHub

* PR‑bot MCP actualiza el PR body con checklist y enlaza issue.
* Si `runAgent('reviewer')` devuelve `severity=high`, añade label `changes-requested` y comenta en el PR con el `violations[]`.
* Si `runAgent('qa')` falla, marca el PR como draft y añade label `qa-failed`.

### 9) DoD de EP01‑T03

* Schemas `.schema.json` creados y versionados.
* Prompts implementados por agente.
* `runner`, `router`, `mappers` funcionando.
* Tests de contrato verdes.
* Handoffs validan contra schema antes de actualizar `TaskRecord` y antes de cambiar estado.
