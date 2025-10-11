# EP02‑T04 — quality.complexity() (especificación + instrucciones + criterios de aceptación)

## Objetivo
Implementar la herramienta del **Quality MCP** `quality.complexity` que calcule métricas de complejidad por **archivo** y por **unidad** (función / método / clase) y devuelva un reporte estructurado, consumible por el orquestador y el **quality gate** (EP02‑T05).

---

## Alcance
- Fuente principal: **typhonjs-escomplex** (ECMAScript complexity) para JS/TS transpirable.
- Alternativa: **ts-morph** para analizar TypeScript cuando `escomplex` no soporte algún constructo.
- Métricas mínimas: `cyclomatic` por unidad, agregados por archivo (`avg`, `max`, `units`) y agregados globales (`avgCyclomatic`, `maxCyclomatic`).
- Exclusiones por glob (tests, mocks, fixtures) y normalización de rutas al **repo root**.

Fuera de alcance: ejecución de tests (EP02‑T01), cobertura (EP02‑T02), lint (EP02‑T03) y aplicación de gates (EP02‑T05).

---

## Contrato MCP
### Tool: `quality.complexity`
**Input schema** (`packages/schemas/quality_complexity.input.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ComplexityInput",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "globs": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["services/task-mcp/src/**/*.ts", "packages/**/*.ts"]
    },
    "repoRoot": { "type": "string", "default": "." },
    "exclude": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["**/*.test.*", "**/__tests__/**", "**/fixtures/**", "**/*.d.ts"]
    },
    "engine": { "type": "string", "enum": ["escomplex", "tsmorph"], "default": "escomplex" },
    "timeoutMs": { "type": "integer", "minimum": 1000, "default": 600000 }
  }
}
```

**Output schema** (`packages/schemas/quality_complexity.output.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ComplexityOutput",
  "type": "object",
  "additionalProperties": false,
  "required": ["avgCyclomatic", "maxCyclomatic", "files", "meta"],
  "properties": {
    "avgCyclomatic": { "type": "number", "minimum": 0 },
    "maxCyclomatic": { "type": "number", "minimum": 0 },
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["path", "avg", "max", "units"],
        "properties": {
          "path": { "type": "string" },
          "avg": { "type": "number", "minimum": 0 },
          "max": { "type": "number", "minimum": 0 },
          "units": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["name", "kind", "cyclomatic", "startLine", "endLine"],
              "properties": {
                "name": { "type": "string" },
                "kind": { "type": "string", "enum": ["function", "method", "class", "arrow", "getter", "setter"] },
                "cyclomatic": { "type": "number", "minimum": 0 },
                "startLine": { "type": "integer", "minimum": 1 },
                "endLine": { "type": "integer", "minimum": 1 },
                "loc": { "type": "integer", "minimum": 0 },
                "params": { "type": "integer", "minimum": 0 }
              }
            }
          }
        }
      }
    },
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["engine", "globs", "excluded"],
      "properties": {
        "engine": { "type": "string", "enum": ["escomplex", "tsmorph"] },
        "globs": { "type": "array", "items": { "type": "string" } },
        "excluded": { "type": "array", "items": { "type": "string" } },
        "failed": { "type": "array", "items": { "type": "string" }, "default": [] }
      }
    }
  }
}
```

**Errores semánticos**
- `NOT_FOUND` cuando los `globs` no rinden archivos.
- `PARSE_ERROR` si el engine no puede analizar un archivo (se reporta el primero en `meta.failed` y se sigue con los demás si es posible).
- `TIMEOUT` si `timeoutMs` expira.

---

## Diseño e implementación
### Estructura
```
/tooling/quality-mcp/
  src/
    tools/complexity.ts           # implementación MCP
    complexity/escomplex.ts       # wrapper sobre typhonjs-escomplex
    complexity/tsmorph.ts         # analizador alternativo con ts-morph
    fs/glob.ts                    # utilidades para globs y exclusiones
    fs/read.ts                    # utilidades comunes
  cli/
    qcli.ts                       # extiende con `run --complexity`
```

### Algoritmo (resumen)
1. Resolver `globs` y aplicar `exclude`.
2. Para cada archivo, invocar el **engine** seleccionado:
   - **escomplex**: obtener métricas por función/método/clase (campo `cyclomatic`).
   - **tsmorph** (fallback): recorrer AST; para cada unidad contar decisiones (`if`, `for`, `while`, `catch`, `case`, operadores ternarios, `&&`, `||`) como aproximación de **complejidad ciclomática**.
3. Normalizar ruta relativa a `repoRoot` y separadores POSIX.
4. Calcular agregados por archivo (`avg`, `max`) y globales (`avgCyclomatic`, `maxCyclomatic`).
5. Validar output con AJV y devolver JSON.

### Consideraciones de rendimiento
- Procesar en lotes (pool) para no saturar CPU.
- Limitar a N unidades máximas por archivo para evitar salidas gigantes (configurable si es necesario).

### Observabilidad
- CLI escribe `./.qreport/complexity.json`.
- Opción: log de advertencias por archivo no parseado.

---

## Instrucciones paso a paso
### 1) Código
1. Añadir schemas `quality_complexity.input.schema.json` y `quality_complexity.output.schema.json` a `packages/schemas/`.
2. Implementar `complexity/escomplex.ts` con `analyzeFile(path)` devolviendo unidades con `cyclomatic` y líneas.
3. Implementar `complexity/tsmorph.ts` con el conteo aproximado de decisiones por unidad como fallback.
4. Implementar `tools/complexity.ts` que:
   - valide input, resuelva globs, aplique exclusiones,
   - elija engine, agregue por archivo y global,
   - valide output y retorne JSON.
5. Registrar la tool en `tooling/quality-mcp/src/tools/index.ts`.

### 2) CLI
- Extender `cli/qcli.ts` con `run --complexity`:
```bash
node tooling/quality-mcp/cli/qcli.ts run --complexity \
  --globs "services/task-mcp/src/**/*.ts" "packages/**/*.ts"
```
Esto escribe `./.qreport/complexity.json`.

### 3) Workflow de CI
Añadir paso tras tests y cobertura:
```yaml
- run: node tooling/quality-mcp/cli/qcli.ts run --complexity
- uses: actions/upload-artifact@v4
  with:
    name: qreport-complexity
    path: ./.qreport/complexity.json
```

---

## Criterios de aceptación (DoD)
- `quality.complexity` implementada, registrada y documentada.
- Input/output validados con AJV y `additionalProperties:false`.
- Métricas por unidad con `cyclomatic`, líneas y tipo de unidad; agregados por archivo y globales.
- Soporte **escomplex** y fallback **tsmorph**.
- Rutas normalizadas al repo root; exclusiones aplicadas.
- CLI genera `./.qreport/complexity.json`.
- Tests unitarios con fixtures sintéticos (baja/alta complejidad) y verificación de agregados.
- Prueba de integración con un subconjunto real de `services/task-mcp/src` en CI.

---

## Plan de PR
**Rama:** `feature/ep02-t04-complexity`

**Título:** `EP02-T04: Quality MCP — complexity() (cyclomatic per unit & aggregates)`

**Descripción (plantilla):**
```
Contexto
- Implementa `quality.complexity` con cálculos por unidad y agregados por archivo/global.

Cambios
- tooling/quality-mcp: engines (escomplex/tsmorph) + tool complexity + CLI
- packages/schemas: input/output schemas de complejidad
- workflows: paso para generar y subir .qreport/complexity.json

Checklist
- [ ] AJV input/output
- [ ] Engine escomplex funcionando
- [ ] Fallback tsmorph validado
- [ ] Artefacto complexity.json publicado
```

**Labels:** `area_quality`, `epic_EP02`, `task`, `agent_dev`.

**Auto‑cierre:** `Closes #87`.
