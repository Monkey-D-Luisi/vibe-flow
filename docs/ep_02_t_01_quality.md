# EP02‑T01 — quality.run_tests() (especificación + instrucciones + criterios de aceptación)

## Objetivo
Implementar la herramienta del **Quality MCP** `quality.run_tests` para ejecutar la suite de tests del monorepo y devolver:
- totales `total/passed/failed`,
- duración en ms,
- listado de pruebas fallidas (ids o descripciones),
- metadatos del run (runner, command, cwd, exitCode).

La herramienta debe ser **determinista**, **segura** (sin filtrar secretos), y usable tanto por el **orquestador** como por **GitHub Actions**.

---

## Alcance
- Runner compatible con **Vitest** (Node/TS) y extensible a otros test runners.
- Salida **estructurada** y validada con JSON Schema.
- CLI opcional para Actions que envíe la salida a `./.qreport/tests.json`.

Quedan fuera en esta tarea: cobertura, lint y complejidad (se implementan en T02, T03 y T04 respectivamente).

---

## Contrato MCP
### Tool: `quality.run_tests`
**Input schema** (`packages/schemas/quality_tests.input.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RunTestsInput",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "cwd": { "type": "string", "description": "Directorio desde el que ejecutar" },
    "cmd": { "type": "string", "description": "Comando de test", "default": "pnpm -C services/task-mcp test -- --reporter=json" },
    "timeoutMs": { "type": "integer", "minimum": 1000, "default": 600000 },
    "envAllow": { "type": "array", "items": { "type": "string" }, "default": ["NODE_ENV"] }
  }
}
```
**Output schema** (`packages/schemas/quality_tests.output.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "RunTestsOutput",
  "type": "object",
  "additionalProperties": false,
  "required": ["total","passed","failed","durationMs","meta"],
  "properties": {
    "total": { "type": "integer", "minimum": 0 },
    "passed": { "type": "integer", "minimum": 0 },
    "failed": { "type": "integer", "minimum": 0 },
    "durationMs": { "type": "integer", "minimum": 0 },
    "failedTests": { "type": "array", "items": { "type": "string" }, "default": [] },
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["runner","cmd","cwd","exitCode"],
      "properties": {
        "runner": { "type": "string" },
        "cmd": { "type": "string" },
        "cwd": { "type": "string" },
        "exitCode": { "type": "integer" }
      }
    }
  }
}
```
**Errores semánticos**
- `TIMEOUT` cuando `timeoutMs` expira.
- `RUNNER_ERROR` para exit codes ≠ 0 con parsing válido.
- `PARSE_ERROR` si el reporter JSON no es interpretable.

---

## Diseño e implementación
### Estructura de código
```
/tooling/quality-mcp/
  package.json
  src/
    tools/run_tests.ts        # implementación MCP
    parsers/vitest.ts         # parseo de salida JSON de Vitest
    exec/spawn.ts             # wrapper seguro de spawn
    schemas/                  # (importa schemas desde packages/schemas)
  cli/
    qcli.ts                   # CLI: `node tooling/quality-mcp/cli/qcli.ts run --tests`
```

### Algoritmo (resumen)
1. **Normalizar comando**: usar `cmd` del input o el `default`.
2. **Spawn seguro**:
   - `stdio` capturado,
   - `env` filtrado por `envAllow` (passthrough de claves permitidas),
   - `timeout` con `AbortController`.
3. **Detectar runner**: si el comando contiene `vitest`, usar parser Vitest.
4. **Parsear salida JSON** de Vitest y mapear a `{ total, passed, failed, durationMs, failedTests, meta }`.
5. **Validar output** con AJV contra `quality_tests.output.schema.json`.
6. **Devolver resultado**; si `failed > 0`, no lanzar excepción (es responsabilidad del **quality gate** decidir), pero sí informar `exitCode`.

### Parser Vitest (ejemplo de mapping esperado)
```ts
interface VitestJson {
  numTotalTests: number; numPassedTests: number; numFailedTests: number; startTime: number; success: boolean; testResults: Array<{ name: string; status: string; assertionResults: Array<{ title: string; status: string }> }>
}
```
- `durationMs = Date.now() - startTime` (o `endTime - startTime` si existe).
- `failedTests`: `suite.name :: assertion.title` para cada `status!=='passed'`.

### Seguridad
- Limitar env: solo variables de `envAllow`.
- Imponer `timeoutMs` (default 10 min).
- Truncar logs a N KB en memoria si son enormes.

### Observabilidad
- Emitir eventos opcionales `quality.run` al **event_log** (si el State MCP está disponible): `{ total, passed, failed, durationMs }`.
- CLI guarda `./.qreport/tests.json`.

---

## Instrucciones paso a paso
### 1) Código
1. Crear carpeta `tooling/quality-mcp/` con la estructura anterior.
2. Implementar `exec/spawn.ts` con `child_process.spawn` + `AbortController`.
3. Implementar `parsers/vitest.ts` y sus tests unitarios.
4. Implementar `tools/run_tests.ts` que:
   - valide input (AJV),
   - ejecute spawn,
   - seleccione parser,
   - valide output (AJV),
   - retorne JSON tipado.
5. Exponer la tool en el **registro MCP** (p. ej. `tools/index.ts`).

### 2) Schemas
- Añadir los dos schemas (`input` y `output`) en `packages/schemas/` y exportarlos.

### 3) CLI para Actions
- `cli/qcli.ts` con comandos:
  - `run --tests` → ejecuta `quality.run_tests` y escribe `./.qreport/tests.json`.

### 4) Scripts del repo
- En la raíz `package.json`, añadir (si no existe):
```json
{
  "scripts": {
    "q:tests": "node tooling/quality-mcp/cli/qcli.ts run --tests"
  }
}
```

### 5) GitHub Actions (mínimo para esta tarea)
- Añadir job al workflow `ci.yml` o crear `quality-tests.yml`:
```yaml
name: quality-tests
on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
jobs:
  tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm i
      - run: pnpm q:tests
      - name: Save test report
        uses: actions/upload-artifact@v4
        with:
          name: qreport-tests
          path: ./.qreport/tests.json
```
> Nota: el **quality gate** consumirá este artefacto en T05. En esta tarea sólo generamos el reporte.

---

## Criterios de aceptación (DoD)
- `quality.run_tests` implementada y registrada en el MCP.
- Input y output validados con AJV contra sus schemas; `additionalProperties: false` en ambos.
- Soporte Vitest con reporter JSON; devuelve `total/passed/failed/durationMs/failedTests` y `meta`.
- Tiempo de ejecución limitado por `timeoutMs`; no se filtran variables de entorno ajenas a `envAllow`.
- Tests unitarios del parser y del wrapper de spawn.
- Prueba de integración que ejecuta `run_tests` sobre el paquete `services/task-mcp` y genera `./.qreport/tests.json`.
- Workflow `quality-tests` publica el artefacto.
- Documentación en README (sección EP02) con ejemplo de invocación CLI y tool MCP.

---

## Plan de PR
**Rama:** `feature/ep02-t01-run-tests`

**Título del PR:** `EP02-T01: Quality MCP — run_tests() (tests totals/duration/failures)`

**Descripción (plantilla sugerida):**
```
Contexto
- Implementa tool MCP `quality.run_tests` para ejecutar Vitest y devolver métricas estructuradas.
- Incluye CLI (`pnpm q:tests`) y artefacto `.qreport/tests.json` para los siguientes gates.

Cambios clave
- tooling/quality-mcp: spawn seguro, parser Vitest, tool run_tests, CLI
- packages/schemas: input/output schemas
- workflows: quality-tests (artefacto de pruebas)

Checklist
- [ ] AJV input/output
- [ ] Timeout aplicado
- [ ] Parser Vitest con unit tests
- [ ] Integración pasando en CI
- [ ] Artefacto qreport-tests subido
```

**Labels:** `area_quality`, `epic_EP02`, `task`, `agent_dev`.

**Auto‑cierre:** vincular issue `#61` en la descripción (`Closes #61`).

---

## Riesgos y mitigaciones
- **Salida no‑JSON** (cambio de reporter): fallará con `PARSE_ERROR`. Mitigar documentando el reporter obligatorio en el `cmd` por defecto.
- **Tiempo excesivo**: `timeoutMs` configurable y cancelación con `AbortController`.
- **Logs enormes**: truncar a 1–5MB en memoria; indicar truncado en `meta` si aplica.

---

## Anexos
### Ejemplo de salida
```json
{
  "total": 33,
  "passed": 33,
  "failed": 0,
  "durationMs": 4123,
  "failedTests": [],
  "meta": { "runner": "vitest", "cmd": "pnpm -C services/task-mcp test -- --reporter=json", "cwd": "/work", "exitCode": 0 }
}
```

### Interfaces sugeridas (TS)
```ts
export interface RunTestsInput { cwd?: string; cmd?: string; timeoutMs?: number; envAllow?: string[] }
export interface RunTestsOutput { total: number; passed: number; failed: number; durationMs: number; failedTests: string[]; meta: { runner: string; cmd: string; cwd: string; exitCode: number } }
```

