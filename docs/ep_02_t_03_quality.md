# EP02‑T03 — quality.lint() (especificación + instrucciones + criterios de aceptación)

## Objetivo
Implementar la herramienta del **Quality MCP** `quality.lint` para ejecutar el linter del proyecto y devolver un reporte **estructurado** con totales de errores/avisos, desglose por archivo y mensajes por regla, listo para ser consumido por el orquestador y el **quality gate** (EP02‑T05).

---

## Alcance
- Linter principal: **ESLint** para el código TypeScript/Node del repo.
- Compatibilidad opcional con **Ruff** (Python), por si el monorepo incorpora módulos Python más adelante.
- Formato de salida **normalizado** independientemente de la herramienta subyacente.
- CLI que guarde el resultado en `./.qreport/lint.json` para su uso en CI.

Fuera de alcance: ejecución de tests (EP02‑T01), cobertura (EP02‑T02), complejidad (EP02‑T04) y el gate agregador (EP02‑T05).

---

## Contrato MCP
### Tool: `quality.lint`
**Input schema** (`packages/schemas/quality_lint.input.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LintInput",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "cwd": { "type": "string", "description": "Directorio de trabajo" },
    "tool": { "type": "string", "enum": ["eslint","ruff"], "default": "eslint" },
    "cmd": { "type": "string", "description": "Comando de linter a ejecutar; debe producir JSON", "default": "pnpm -C services/task-mcp lint -f json" },
    "paths": { "type": "array", "items": { "type": "string" }, "description": "Rutas o globs a analizar" },
    "timeoutMs": { "type": "integer", "minimum": 1000, "default": 600000 },
    "envAllow": { "type": "array", "items": { "type": "string" }, "default": ["NODE_ENV"] }
  }
}
```
**Output schema** (`packages/schemas/quality_lint.output.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LintOutput",
  "type": "object",
  "additionalProperties": false,
  "required": ["errors","warnings","byFile","meta"],
  "properties": {
    "errors": { "type": "integer", "minimum": 0 },
    "warnings": { "type": "integer", "minimum": 0 },
    "byFile": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["file","errors","warnings","messages"],
        "properties": {
          "file": { "type": "string" },
          "errors": { "type": "integer", "minimum": 0 },
          "warnings": { "type": "integer", "minimum": 0 },
          "messages": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["ruleId","severity","message"],
              "properties": {
                "ruleId": { "type": ["string","null"] },
                "severity": { "type": "string", "enum": ["error","warning","info"] },
                "message": { "type": "string" },
                "line": { "type": "integer", "minimum": 0 },
                "column": { "type": "integer", "minimum": 0 },
                "endLine": { "type": "integer", "minimum": 0 },
                "endColumn": { "type": "integer", "minimum": 0 }
              }
            }
          }
        }
      }
    },
    "summaryByRule": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["ruleId","errors","warnings"],
        "properties": {
          "ruleId": { "type": ["string","null"] },
          "errors": { "type": "integer", "minimum": 0 },
          "warnings": { "type": "integer", "minimum": 0 }
        }
      },
      "default": []
    },
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["tool","cmd","cwd","exitCode"],
      "properties": {
        "tool": { "type": "string", "enum": ["eslint","ruff"] },
        "cmd": { "type": "string" },
        "cwd": { "type": "string" },
        "exitCode": { "type": "integer" }
      }
    }
  }
}
```
**Errores semánticos**
- `TIMEOUT` si expira `timeoutMs`.
- `RUNNER_ERROR` si el proceso devuelve exit code ≠ 0 pero produce JSON parseable.
- `PARSE_ERROR` si la salida no es JSON válido.

---

## Diseño e implementación
### Estructura
```
/tooling/quality-mcp/
  src/
    tools/lint.ts            # implementación MCP
    parsers/eslint.ts        # mapea JSON de ESLint → formato normalizado
    parsers/ruff.ts          # mapea JSON de Ruff → formato normalizado (opcional)
    exec/spawn.ts            # reutiliza wrapper seguro (EP02‑T01)
  cli/
    qcli.ts                  # extiende con `run --lint`
```

### Algoritmo (resumen)
1. Validar input (AJV) y construir comando (`cmd` o default por `tool`).
2. Ejecutar `spawn` con `envAllow` y `timeoutMs`; capturar stdout/stderr.
3. Parsear JSON:
   - **ESLint**: `[{ filePath, errorCount, warningCount, messages: [{ ruleId, severity(2/1), message, line, column, endLine, endColumn }] }]`.
   - **Ruff**: array de objetos con `filename`, `code` (rule), `message`, `location`… mapeado a la estructura común.
4. Agregar totales y `summaryByRule`.
5. Validar output con AJV (`additionalProperties:false`).
6. Devolver resultado sin lanzar excepción por warnings/errores (la decisión la toma el **quality gate**).

### Normalización de severidad
- ESLint: `severity: 2 → error`, `1 → warning`.
- Ruff: `F/E/W/...` → mapear por prefijo: `E/F` → `error`, `W` → `warning`, resto → `info`.

### Observabilidad
- CLI guarda `./.qreport/lint.json`.
- (Opcional) generar `./.qreport/lint-summary.md` para comentarios de PR en EP03.

### Seguridad
- Filtrar variables de entorno por `envAllow`.
- Limitar tamaño de stdout leído o truncar con indicación en `meta`.

---

## Instrucciones paso a paso
### 1) Código
1. Añadir schemas `quality_lint.input.schema.json` y `quality_lint.output.schema.json` a `packages/schemas/`.
2. Implementar `parsers/eslint.ts` y, si se desea, `parsers/ruff.ts` con unit tests.
3. Implementar `tools/lint.ts` que use `exec/spawn.ts`, seleccione parser por `tool`, normalice severidades y construya `summaryByRule`.
4. Registrar la tool en `tooling/quality-mcp/src/tools/index.ts`.

### 2) CLI
- Extender `cli/qcli.ts` con:
```bash
node tooling/quality-mcp/cli/qcli.ts run --lint \
  --cmd "pnpm -C services/task-mcp lint -f json"
```
Esto escribe `./.qreport/lint.json`.

### 3) Workflow de CI
Añadir paso después de tests/cobertura:
```yaml
- run: node tooling/quality-mcp/cli/qcli.ts run --lint
- uses: actions/upload-artifact@v4
  with:
    name: qreport-lint
    path: ./.qreport/lint.json
```

---

## Criterios de aceptación (DoD)
- `quality.lint` implementada, registrada en el MCP y documentada.
- Input/output validados con AJV y `additionalProperties:false`.
- Soporte ESLint completo; soporte Ruff opcional pero probado si se incluye.
- Totales `errors/warnings` correctos, `byFile` con mensajes detallados y `summaryByRule` consistente.
- CLI genera `./.qreport/lint.json`.
- Tests unitarios para el parser de ESLint (y Ruff si procede) y para el agregador de summary.
- Prueba de integración ejecutando el linter real del paquete `services/task-mcp` en CI y publicando el artefacto `qreport-lint`.

---

## Plan de PR
**Rama:** `feature/ep02-t03-lint`

**Título:** `EP02-T03: Quality MCP — lint() (errors/warnings by file & rule)`

**Descripción (plantilla):**
```
Contexto
- Implementa `quality.lint` con salida normalizada y CLI para Actions.

Cambios
- tooling/quality-mcp: tool lint + parsers (eslint/ruff) + CLI
- packages/schemas: input/output schemas
- workflows: paso para generar y subir .qreport/lint.json

Checklist
- [ ] AJV input/output
- [ ] Parser ESLint validado
- [ ] Summary por regla correcto
- [ ] Artefacto lint.json publicado
```

**Labels:** `area_quality`, `epic_EP02`, `task`, `agent_dev`.

**Auto‑cierre:** `Closes #59`.

