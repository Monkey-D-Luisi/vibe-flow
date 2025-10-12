# Prompt — Agente IA: Reducir complejidad hasta pasar el gate + Arreglar logging del servidor (pino-pretty)

> Documento listo para pegar en el agente (Codex/VS Code). Contiene contexto, objetivos, pasos exactos, criterios de aceptación, comandos y plan de PR. Estilo neutral, sin opiniones.

---

## 0) Contexto del repositorio
- Proyecto: **agents-mcps** (monorepo Node/TypeScript, ESM, pnpm)
- SO: **Windows + PowerShell** (no usar `pnpm dlx` en scripts)
- Épicas completadas: **EP01** y **EP02**
- Estado actual de calidad (scope=minor):
  - Tests: OK
  - Cobertura: OK (`lines ≈ 0.8346`)
  - Lint: OK (`errors = 0`)
  - **Complejidad**: KO (`avg ≈ 3.53`, `max = 40`) → viola umbral `max ≤ 12`
- Estado servidor Quality MCP: al arrancar, error **pino**:
  ```
  Error: unable to determine transport target for "pino-pretty"
  at pino/lib/transport.js:160
  ```

**Objetivo general**: (A) Reducir complejidad para cumplir el gate; (B) Arreglar logging del servidor HTTP (pino-pretty). Mantener tests verdes y sin relajar umbrales.

---

## 1) Objetivos y criterios de aceptación

### 1.A Complejidad (quality.complexity + gate)
- **DoD**:
  - `.qreport/complexity.json`: `maxCyclomatic ≤ 12` y `avgCyclomatic ≤ 5`.
  - `.qreport/gate.json` con `passed: true` para `--scope minor` y `--scope major`.
  - Sin cambios funcionales no justificados; test suite verde.

### 1.B Servidor Quality MCP (pino-pretty)
- **DoD**:
  - `pnpm -C tooling/quality-mcp/server start` arranca sin error.
  - Logs legibles cuando `QUALITY_PRETTY_LOGS=true` usando `pino-pretty`.
  - Sin `pino` errors en Windows/Node 20+/22; fallback a logs JSON si falta pretty.

---

## 2) Plan de trabajo — Parte A: Reducir complejidad

### 2.1 Detectar hotspots actuales
Ejecutar en la raíz (ya existe reporte al correr `pnpm q:complexity`):
```powershell
$comp = Get-Content .\.qreport\complexity.json | ConvertFrom-Json
$comp.files | Sort-Object -Property max -Descending | Select-Object -First 10 -Property path, avg, max | Format-Table -AutoSize
$flat = foreach ($f in $comp.files) { foreach ($u in $f.units) { [pscustomobject]@{ path=$f.path; name=$u.name; kind=$u.kind; cyclomatic=[double]$u.cyclomatic; lines=($u.endLine-$u.startLine+1) } } }
$flat | Sort-Object cyclomatic -Descending | Select-Object -First 10 | Format-Table -AutoSize
```
Hotspots esperados (aprox.):
- `services/task-mcp/src/repo/sqlite.ts` → `TaskRepository` class 40
- `services/task-mcp/src/mcp/tools.ts` → arrow anónima ~27
- `services/task-mcp/src/domain/FastTrackGitHub.ts` → class ~26
- `services/task-mcp/src/orchestrator/runner.ts` → `runOrchestratorStep` ~21
- Otros: `TaskRecordValidator` ~18, `evaluateFastTrack` ~17, `mergeTaskWithPatch` ~16, etc.

### 2.2 Refactors específicos por archivo
Aplicar los siguientes patrones, en este orden. Tras cada item, re‑medir complejidad y gate.

**A) `services/task-mcp/src/mcp/tools.ts` (27 → objetivo ≤ 8)**
1. Crear `services/task-mcp/src/mcp/tools/handlers/` y mover cada tool a un handler dedicado con validación AJV propia.
2. Implementar **dispatcher por tabla**:
   ```ts
   const handlers: Record<string, (input: unknown) => Promise<unknown>> = {
     'task.create': handleTaskCreate,
     'task.update': handleTaskUpdate,
     'quality.run_tests': runTests,
     'quality.coverage_report': coverageReport,
     'quality.lint': lint,
     'quality.complexity': complexity,
   } as const;
   export async function handleToolCall(tool: string, input: unknown) {
     const h = handlers[tool];
     if (!h) throw new NotFound404(`Unsupported tool ${tool}`);
     return h(input);
   }
   ```
3. Quitar `if/switch` anidados y validaciones mezcladas; cada handler valida su input/output.

**B) `services/task-mcp/src/repo/sqlite.ts` (class 40, `create` 19 → ≤ 12 y ≤ 8)**
1. Partir en módulos:
   - `repo/statements.ts`: SQL parametrizado (insert/update/search).
   - `repo/row-mapper.ts`: mapeo filas ↔ entidades.
   - `repo/guards.ts`: `ensureNew`, `checkRev`, etc.
   - `repo/repository.ts`: orquestación mínima.
2. Encapsular optimistic lock:
   ```ts
   export function withOptimisticLock<T>(db,id,rev,fn:()=>T){ if(!checkRev(db,id,rev)) throw new OptimisticLockError(id,rev); return fn(); }
   ```
3. Reducir `create()` a: validar → construir SQL → ejecutar → mapear.

**C) `services/task-mcp/src/orchestrator/runner.ts` (21 → ≤ 12)**
- Reescribir como **pipeline**:
  ```ts
  export async function runOrchestratorStep(ctx, taskId){
    const lease = await acquireLease(ctx, taskId)
    try{
      const next = await decideNext(ctx, taskId)
      const output = await runAgent(ctx, next)
      await applyPatch(ctx, taskId, output)
      await appendEvent(ctx, taskId, next, output)
      return { next }
    } finally { await releaseLease(ctx, taskId, lease) }
  }
  ```
- Si el gate aplica en la transición, encapsular en `enforceQualityGate(ctx, taskId, stage)`.

**D) `services/task-mcp/src/domain/FastTrackGitHub.ts` (26 → ≤ 12)**
- Extraer helpers puros: `labels.ts`, `comments.ts`, `pr.ts`. La clase solo compone.

**E) `TaskRecordValidator`, `evaluateFastTrack`, `mergeTaskWithPatch`, `LeaseRepository`, `nextAgent`**
- Mapas de guards por transición, motor de reglas declarativas y **early returns**. `mergeTaskWithPatch` con **whitelist** estricto.

### 2.3 Validación tras cada bloque
```powershell
pnpm q:complexity
pnpm q:gate --source artifacts --scope minor
```
Cuando `max ≤ 12` y `avg ≤ 5`, validar también `major`:
```powershell
pnpm q:gate --source artifacts --scope major
```

---

## 3) Plan de trabajo — Parte B: Arreglar logging del servidor (pino-pretty)

### 3.1 Añadir dependencia y configuración segura
1. **Dependencia** (dev): `pino-pretty`
   ```powershell
   pnpm -C tooling/quality-mcp/server add -D pino-pretty
   ```
2. **Configuración del logger** en `tooling/quality-mcp/server/src/index.ts` (o módulo de logger si existe):
   ```ts
   import pino from 'pino'

   const level = process.env.LOG_LEVEL ?? 'info'
   const pretty = process.env.QUALITY_PRETTY_LOGS === 'true'

   // Fallback seguro: si falta pino-pretty, usar JSON sin romper
   const logger = pretty
     ? pino({ level, transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' } } })
     : pino({ level })

   export const log = logger
   ```
3. Usar `log` en lugar de crear pino ad‑hoc en otros módulos.

> Nota: El error actual "unable to determine transport target for 'pino-pretty'" ocurre cuando no está instalado o la `transport` no se resuelve. La solución es **instalar `pino-pretty`** y pasar el `target` como string tal cual, como arriba.

### 3.2 Arranque local
```powershell
$env:QUALITY_MCP_KEYS = 'abc123:run'
$env:QUALITY_PRETTY_LOGS = 'true'
pnpm -C tooling/quality-mcp/server build
pnpm -C tooling/quality-mcp/server start
```
Probar endpoints:
```powershell
$h=@{Authorization='Bearer abc123'; 'Content-Type'='application/json'}
$body=@{ tool='quality.run_tests'; input=@{} } | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://localhost:8080/mcp/tool' -Method Post -Headers $h -Body $body
```
SSE:
```powershell
curl.exe -N -H "Authorization: Bearer abc123" -H "Content-Type: application/json" ^
  -d '{"tool":"quality.run_tests","input":{},"stream":true}' ^
  http://localhost:8080/mcp/tool/stream
```

---

## 4) Commits y PRs
- **Se recomiendan 2 PRs** para mantener cambios limpios:
  1. `refactor(ep02): reduce cyclomatic complexity to pass quality gate`
  2. `fix(server): configure pino transport with pino-pretty (Windows-safe) + fallback`

Cada PR debe adjuntar:
- `./.qreport/complexity.json` con `max ≤ 12`, `avg ≤ 5` (solo en PR 1).
- `./.qreport/gate.json` con `passed: true` para `minor` y `major` (PR 1).
- Evidencia de arranque del server y petición `/mcp/tool` con 200 (PR 2).

---

## 5) Comandos de verificación (PowerShell)
```powershell
# Calidad
pnpm q:tests
pnpm q:coverage
pnpm q:lint
pnpm q:complexity
pnpm q:gate --source artifacts --scope minor
pnpm q:gate --source artifacts --scope major
Get-Content .\.qreport\gate.json

# Servidor HTTP
$env:QUALITY_MCP_KEYS = 'abc123:run'
$env:QUALITY_PRETTY_LOGS = 'true'
pnpm -C tooling/quality-mcp/server start
```

---

## 6) Restricciones
- No relajar umbrales de calidad ni desactivar reglas globales de ESLint.
- ESM estricto (sin `require`), AJV con `additionalProperties:false`.
- Sin `--watch` en procesos que se ejecuten desde scripts automatizados.

---

## 7) Salida esperada del agente
- PRs con:
  - Complejidad reducida (gate en verde para `minor` y `major`).
  - Servidor arrancando sin error de `pino-pretty`; logs bonitos si `QUALITY_PRETTY_LOGS=true`.
  - Tests verdes.
  - README actualizado con notas de arranque en Windows.

