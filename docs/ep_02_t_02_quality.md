# EP02‑T02 — quality.coverage\_report() (especificación + instrucciones + criterios de aceptación)

## Objetivo

Implementar la herramienta del **Quality MCP** `quality.coverage_report` para leer reportes de cobertura (Vitest/Istanbul) y devolver métricas **agregadas** y **por archivo** con formato estable y validado. Será usada por el orquestador y por el **quality gate** (EP02‑T05).

---

## Alcance

- Fuentes soportadas: `coverage-summary.json` (Istanbul) y `lcov.info`.
- Normalización de rutas (raíz del repo, elimina prefijos del runner).
- Métricas en **rango 0..1** (no porcentajes) para alinear con la política: 0.80 = 80 %.
- Exclusiones configurables por glob (tests, mocks, fixtures opcionales).

Quedan fuera: ejecución de tests (EP02‑T01), lint (EP02‑T03), complejidad (EP02‑T04), gate (EP02‑T05).

---

## Contrato MCP

### Tool: `quality.coverage_report`

**Input schema** (`packages/schemas/quality_coverage.input.schema.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CoverageReportInput",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "summaryPath": { "type": "string", "default": "services/task-mcp/coverage/coverage-summary.json" },
    "lcovPath": { "type": "string", "default": "services/task-mcp/coverage/lcov.info" },
    "repoRoot": { "type": "string", "default": "." },
    "exclude": { "type": "array", "items": { "type": "string" }, "default": ["**/*.test.*", "**/__tests__/**", "**/fixtures/**"] }
  }
}
```

**Output schema** (`packages/schemas/quality_coverage.output.schema.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CoverageReportOutput",
  "type": "object",
  "additionalProperties": false,
  "required": ["total","files"],
  "properties": {
    "total": {
      "type": "object",
      "additionalProperties": false,
      "required": ["lines","statements","branches","functions"],
      "properties": {
        "lines": { "type": "number", "minimum": 0, "maximum": 1 },
        "statements": { "type": "number", "minimum": 0, "maximum": 1 },
        "branches": { "type": "number", "minimum": 0, "maximum": 1 },
        "functions": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["path","lines"],
        "properties": {
          "path": { "type": "string" },
          "lines": { "type": "number", "minimum": 0, "maximum": 1 },
          "statements": { "type": "number", "minimum": 0, "maximum": 1 },
          "branches": { "type": "number", "minimum": 0, "maximum": 1 },
          "functions": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source","summaryPath","lcovPath","excluded"],
      "properties": {
        "source": { "type": "string", "enum": ["istanbul"] },
        "summaryPath": { "type": "string" },
        "lcovPath": { "type": "string" },
        "excluded": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

**Errores semánticos**

- `NOT_FOUND` si `summaryPath` o `lcovPath` no existen (según configuración).
- `PARSE_ERROR` si los archivos no son interpretables.

---

## Diseño e implementación

### Estructura

```
/tooling/quality-mcp/
  src/
    tools/coverage_report.ts   # implementación MCP
    parsers/istanbul.ts        # lee summary + lcov
    fs/read.ts                 # utilidades para IO seguras
  cli/
    qcli.ts                    # extiende con `run --coverage`
```

### Algoritmo (resumen)

1. Leer `coverage-summary.json` (Istanbul) y mapear `pct/total/covered`.
2. Normalizar a **ratio 0..1** dividiendo `pct/100`.
3. Si existe `lcov.info`, completar/ajustar rutas por archivo:
   - Parsear LCOV y calcular por `SF` (source file) los ratios de líneas/funciones/branches.
   - Normalizar rutas con `repoRoot` y eliminar prefijos temporales.
4. Aplicar exclusiones glob de `exclude`.
5. Armar salida `{ total, files, meta }` y **validarla** con AJV.

### Normalización de rutas

- Convertir separadores a POSIX (`/`).
- Remover `process.cwd()` o workdir de Actions si contamina las rutas.
- Si la ruta está fuera de `repoRoot`, registrar como advertencia (no bloquear).

### Observabilidad

- Guardar reporte en `./.qreport/coverage.json` cuando se ejecute vía CLI.
- Opción: escribir un sumario Markdown para comentarios de PR (lo hará el PR‑bot en EP03).

---

## Instrucciones paso a paso

### 1) Código

1. Crear `parsers/istanbul.ts` que exporte `parseSummary(path)` y `parseLCOV(path)`.
2. Implementar `tools/coverage_report.ts` que:
   - valide input,
   - lea summary + lcov,
   - calcule ratios 0..1 y normalice rutas,
   - filtre `exclude`,
   - valide output y devuelva JSON.
3. Registrar la tool en `tooling/quality-mcp/src/tools/index.ts`.

### 2) CLI

- Extender `cli/qcli.ts` con `run --coverage`:

```bash
node tooling/quality-mcp/cli/qcli.ts run --coverage \
  --summary services/task-mcp/coverage/coverage-summary.json \
  --lcov services/task-mcp/coverage/lcov.info
```

Esto escribe `./.qreport/coverage.json`.

### 3) Workflow de CI

- Añadir job (o paso) que ejecute la CLI tras los tests:

```yaml
- run: pnpm q:tests
- run: node tooling/quality-mcp/cli/qcli.ts run --coverage
- uses: actions/upload-artifact@v4
  with:
    name: qreport-coverage
    path: ./.qreport/coverage.json
```

---

## Criterios de aceptación (DoD)

- `quality.coverage_report` implementada y registrada en el MCP.
- Ratios 0..1 para total y por archivo; rutas normalizadas a repo root.
- Input/output validados con AJV y `additionalProperties:false`.
- Exclusiones por glob aplicadas y reflejadas en `meta.excluded`.
- `./.qreport/coverage.json` generado por la CLI.
- Tests unitarios: parseo de summary y lcov, normalización de rutas, exclusiones.
- Prueba de integración leyendo los artefactos generados tras EP02‑T01.
- Job de CI sube artefacto `qreport-coverage`.

---

## Plan de PR

**Rama:** `feature/ep02-t02-coverage-report`

**Título:** `EP02-T02: Quality MCP — coverage_report() (total & per-file ratios)`

**Descripción (plantilla):**

```
Contexto
- Implementa `quality.coverage_report` con ratios 0..1 y per-file report.

Cambios
- tooling/quality-mcp: parser istanbul + tool coverage_report + CLI
- packages/schemas: input/output schemas de cobertura
- workflows: paso para generar y subir .qreport/coverage.json

Checklist
- [ ] AJV input/output
- [ ] Rutas normalizadas
- [ ] Exclusiones aplicadas
- [ ] Artefacto coverage.json publicado
```

**Labels:** `area_quality`, `epic_EP02`, `task`, `agent_dev`.

**Auto‑cierre:** `Closes #60` (si ese es el issue de cobertura, ajusta el número).

