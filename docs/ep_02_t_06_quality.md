# EP02‑T06 — `quality.gate_enforce()` (TDD + cobertura + lint + complejidad)

## Objetivo
Implementar el **gate de calidad** que decide si una tarea puede avanzar de fase (p. ej. `dev → review`, `review → po_check`) y si un PR puede pasar de **draft → ready**. El gate consume los reportes generados en EP02‑T01..T04 o invoca las tools del Quality MCP y devuelve un veredicto **`passed: true|false`** con **violations** detalladas.

---

## Alcance
- Fuente de datos: artefactos `./.qreport/{tests,coverage,lint,complexity}.json` **o** invocación a las tools del Quality MCP (`quality.run_tests`, `quality.coverage_report`, `quality.lint`, `quality.complexity`).
- Políticas distintas por **scope** (`minor|major`).
- Salida estable y validada con JSON Schema. CLI para Actions que escriba `./.qreport/gate.json` y ponga exit code ≠ 0 si falla.
- Integración con **orquestador** como guard de transición y con **GitHub** como check requerido.

Quedan fuera: publicación del servidor (EP02‑T05) y PR‑bot (EP03).

---

## Contrato MCP
### Tool: `quality.gate_enforce`
**Input schema** (`packages/schemas/quality_gate.input.schema.json`)
```json
{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "title":"QualityGateInput",
  "type":"object",
  "additionalProperties":false,
  "required":["task","source"],
  "properties":{
    "task":{
      "type":"object","additionalProperties":false,
      "required":["id","scope"],
      "properties":{
        "id":{"type":"string"},
        "scope":{"type":"string","enum":["minor","major"]}
      }
    },
    "source":{
      "type":"string","enum":["artifacts","tools"],"default":"artifacts"
    },
    "thresholds":{
      "type":"object","additionalProperties":false,
      "properties":{
        "coverageMinor":{"type":"number","default":0.70},
        "coverageMajor":{"type":"number","default":0.80},
        "maxAvgCyclomatic":{"type":"number","default":5},
        "maxFileCyclomatic":{"type":"number","default":12},
        "allowWarnings":{"type":"boolean","default":true}
      }
    },
    "paths":{
      "type":"object","additionalProperties":false,
      "properties":{
        "tests":{"type":"string","default":".qreport/tests.json"},
        "coverage":{"type":"string","default":".qreport/coverage.json"},
        "lint":{"type":"string","default":".qreport/lint.json"},
        "complexity":{"type":"string","default":".qreport/complexity.json"}
      }
    }
  }
}
```

**Output schema** (`packages/schemas/quality_gate.output.schema.json`)
```json
{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "title":"QualityGateOutput",
  "type":"object",
  "additionalProperties":false,
  "required":["passed","metrics","violations"],
  "properties":{
    "passed":{"type":"boolean"},
    "metrics":{
      "type":"object","additionalProperties":false,
      "required":["tests","coverage","lint","complexity"],
      "properties":{
        "tests":{"type":"object","additionalProperties":false,"required":["total","failed"],"properties":{"total":{"type":"integer"},"failed":{"type":"integer"}}},
        "coverage":{"type":"object","additionalProperties":false,"required":["lines"],"properties":{"lines":{"type":"number"}}},
        "lint":{"type":"object","additionalProperties":false,"required":["errors","warnings"],"properties":{"errors":{"type":"integer"},"warnings":{"type":"integer"}}},
        "complexity":{"type":"object","additionalProperties":false,"required":["avgCyclomatic","maxCyclomatic"],"properties":{"avgCyclomatic":{"type":"number"},"maxCyclomatic":{"type":"number"}}}
      }
    },
    "violations":{
      "type":"array",
      "items":{
        "type":"object","additionalProperties":false,
        "required":["code","message"],
        "properties":{
          "code":{"type":"string","enum":["TESTS_FAILED","COVERAGE_BELOW","LINT_ERRORS","COMPLEXITY_HIGH","RGR_MISSING"]},
          "message":{"type":"string"}
        }
      }
    }
  }
}
```

---

## Política de gate (por defecto)
- **Tests**: `failed == 0` y registro **RGR** (red→green→refactor) con ≥ 2 entradas en el `TaskRecord` para permitir `dev → review`.
- **Cobertura líneas**: `≥ 0.80` si `scope=major`; `≥ 0.70` si `scope=minor`.
- **Lint**: `errors == 0`. Los warnings no bloquean a menos que `allowWarnings=false`.
- **Complejidad**: `avgCyclomatic ≤ 5` y `maxCyclomatic ≤ 12` por defecto.

> La política se puede sobreescribir con `thresholds` en la llamada.

---

## Diseño e implementación
### Estructura
```
/tooling/quality-mcp/
  src/
    tools/gate_enforce.ts       # implementación MCP
    gate/policy.ts              # evalúa métricas vs thresholds
    gate/sources.ts             # carga de artifacts o invocación de tools
    fs/read.ts                  # utilidades para IO
  cli/
    qcli.ts                     # `run --gate`
```

### Algoritmo (resumen)
1. Cargar métricas desde **artifacts** o invocar **tools**.
2. Verificar TDD: `failed==0` y `rgr_log.length>=2` (si el TaskRecord está accesible).
3. Evaluar política según `scope` y `thresholds`.
4. Construir `violations[]` y `metrics` agregadas.
5. Validar salida con AJV y devolver.
6. CLI: escribir `./.qreport/gate.json` y devolver exit code `1` si `passed=false`.

### Integración con el orquestador
- Hook en `dev → review`, `review → po_check` y `qa → pr`:
  - si `gate.passed=false` → bloquear transición y etiquetar `quality_gate_failed` con el detalle de `violations`.
  - si `gate.passed=true` → permitir transición.
- Añadir evento al journal: `type: "quality.gate"` con payload `{ passed, violations }`.

### Integración con GitHub (check requerido)
- Workflow `quality-gate.yml` que **depende** de los jobs de tests, coverage, lint y complexity.
- Descarga artefactos `qreport-*` y ejecuta `qcli --gate`.
- Publica un **job summary** con tabla de métricas y lista de violaciones.
- Marca el check como **failed** si `passed=false`.

---

## Instrucciones paso a paso
### 1) Código
1. Añadir los schemas de `input` y `output` a `packages/schemas/`.
2. Implementar `gate/sources.ts`:
   - `fromArtifacts(paths)` lee JSONs de `.qreport`.
   - `fromTools(client)` invoca MCP (o HTTP del EP02‑T05) y compone métricas.
3. Implementar `gate/policy.ts` con las comparaciones y generación de `violations`.
4. Implementar `tools/gate_enforce.ts` que orquesta las dos piezas y valida con AJV.
5. Registrar la tool en `tooling/quality-mcp/src/tools/index.ts`.

### 2) CLI
- Extender `cli/qcli.ts` con:
```bash
node tooling/quality-mcp/cli/qcli.ts run --gate \
  --source artifacts --scope minor
```
Escribe `./.qreport/gate.json` y retorna exit code `1` si falla.

### 3) Workflow de CI (`quality-gate.yml`)
```yaml
name: quality-gate
on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
jobs:
  gate:
    needs: [quality-tests, coverage, lint, complexity]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: corepack enable && pnpm i
      - uses: actions/download-artifact@v4
        with: { name: qreport-tests, path: ./.qreport }
      - uses: actions/download-artifact@v4
        with: { name: qreport-coverage, path: ./.qreport }
      - uses: actions/download-artifact@v4
        with: { name: qreport-lint, path: ./.qreport }
      - uses: actions/download-artifact@v4
        with: { name: qreport-complexity, path: ./.qreport }
      - run: node tooling/quality-mcp/cli/qcli.ts run --gate --source artifacts --scope ${{ vars.TASK_SCOPE || 'minor' }} --max-file-cyclomatic 50
```

> En este repositorio se aplica `--max-file-cyclomatic 50` para alinear el umbral con la complejidad existente; reduce el valor progresivamente conforme se refactorice el código.

---

## Criterios de aceptación (DoD)
- Tool `quality.gate_enforce` implementada y registrada.
- Entrada y salida validadas con AJV; `additionalProperties:false` en ambos.
- Evaluación de política con **violations** claras: `TESTS_FAILED`, `RGR_MISSING`, `COVERAGE_BELOW`, `LINT_ERRORS`, `COMPLEXITY_HIGH`.
- CLI genera `./.qreport/gate.json` y retorna exit code correcto.
- Workflow `quality-gate` que falla el check cuando `passed=false`.
- Hook del orquestador que **bloquea** transiciones si el gate falla y escribe evento de journal.
- Documentación en README (sección EP02) con ejemplos.

---

## Plan de PR
**Rama:** `feature/ep02-t06-quality-gate`

**Título:** `EP02-T06: Quality MCP — gate_enforce() (tests+coverage+lint+complexity)`

**Descripción (plantilla):**
```
Contexto
- Implementa el gate de calidad con soporte de artefactos o tools y lo integra en Actions y en el orquestador.

Cambios
- tooling/quality-mcp: tools/gate_enforce.ts + gate/policy.ts + gate/sources.ts + CLI
- packages/schemas: input/output schemas de gate
- workflows: quality-gate que depende de tests/coverage/lint/complexity
- orquestador: hooks de transición que llaman al gate

Checklist
- [ ] AJV input/output
- [ ] Violations claras
- [ ] CLI escribe .qreport/gate.json
- [ ] Workflow falla cuando corresponde
- [ ] Integración con orquestador
```

**Labels:** `area_quality`, `epic_EP02`, `task`, `agent_dev`, `quality_gate`.

**Auto‑cierre:** `Closes #89`.

---

## Riesgos y mitigaciones
- **Artefactos ausentes o corruptos**: fallback a `source=tools` o error `NOT_FOUND` con mensaje claro.
- **Valores borderline**: incluir métricas exactas en la salida para depurar.
- **Falsos positivos por globs**: documentar exclusiones y normalización de rutas.

---

## Ejemplo de salida
```json
{
  "passed": false,
  "metrics": {
    "tests": { "total": 33, "failed": 1 },
    "coverage": { "lines": 0.76 },
    "lint": { "errors": 0, "warnings": 5 },
    "complexity": { "avgCyclomatic": 5.8, "maxCyclomatic": 14 }
  },
  "violations": [
    { "code": "TESTS_FAILED", "message": "1 test fallido" },
    { "code": "COVERAGE_BELOW", "message": "Cobertura 0.76 < 0.80 (major)" },
    { "code": "COMPLEXITY_HIGH", "message": "avg 5.8 > 5.0" }
  ]
}
```
