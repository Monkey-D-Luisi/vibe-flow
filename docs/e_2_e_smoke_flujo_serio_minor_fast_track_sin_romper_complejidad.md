# E2E Smoke — Flujo serio (minor, fast‑track) sin romper complejidad

> Lista para usar con el agente. El objetivo es probar de punta a punta **sin tocar umbrales** y **sin reventar la complejidad** ya saneada. Windows + PowerShell.

---

## 1) Objetivo
Ejecutar un flujo completo para una tarea `scope=minor` usando fast‑track (PO → DEV), generando evidencias reales con **Quality MCP**, y avanzando estados con `task.transition` hasta **PR** y **done**, respetando los guards del dominio.

DoD del smoke:
- Quality artifacts generados (`tests/coverage/lint/complexity`).
- Gate `minor` y `major` en **verde**.
- Servidor Quality MCP HTTP responde **200** en `/mcp/tool` y streamea en `/mcp/tool/stream`.
- State machine avanza con `task.transition` aportando evidencias desde `.qreport/*`.
- Ningún aumento de complejidad ni cambios de thresholds.

---

## 2) Tarea para el agente: crear harness E2E
**Crear archivo:** `tooling/smoke/e2e-minor-fasttrack.ts` (usar TSX runtime, ESM).

**Requisitos del harness:**
1. **Generar artefactos** invocando la CLI del Quality MCP (vía child_process o import directo si exporta funciones):
   - `qcli run --tests` → `./.qreport/tests.json`
   - `qcli run --coverage` → `./.qreport/coverage.json`
   - `qcli run --lint` → `./.qreport/lint.json`
   - `qcli run --complexity` → `./.qreport/complexity.json`
2. **Construir evidencia** para `dev → review` a partir de esos artefactos:
   - `rgrLog`: tamaño ≥ 2 (red/green/refactor) si el proyecto lo emite, si no, simular dos entradas mínimas con timestamp.
   - `coverage.lines` del coverage.json (ratio 0..1) y comprobar umbral minor ≥ 0.70.
   - `lint.errors == 0` y `complexity.maxCyclomatic ≤ 12`.
3. **Crear tarea** con `task.create` (vía módulo de MCP tools del Task MCP):
   - Campos mínimos: `title`, `scope: "minor"`, `acceptance_criteria: ["..."]`, `status` inicial conforme a dominio (si debe ser `po`, luego transitar a `dev`).
4. **Fast‑track**: si existe tool o función `fasttrack.evaluate`, invocarla y registrar etiqueta/nota en la tarea. Si no existe, avanzar `po → dev` con los mínimos del dominio.
5. **Transiciones de estado** usando `task.transition`:
   - `po → dev` (si aplica) con evidencia PO/brief o marca de fast‑track.
   - `dev → review` con evidencia de TDD + coverage + lint + complexity.
   - `review → po_check` sin **violations.high** (si hay, devolver a `dev`).
   - `po_check → qa` con `acceptance_criteria_met = true`.
   - `qa → pr` con `qa_report.pass = true`.
   - `pr → done` con `merged = true`.
6. **Journal**: si expone `state.events` o similar, leer eventos y imprimir un resumen ordenado.
7. **Salida**: imprimir JSON final `{ id, status, rounds, evidence: { ... }, timeline: [...] }`.

**Importante:**
- **No** subir umbrales ni tocar configuraciones de quality gate.
- Ejecutar los imports desde **src** con **TSX runtime** o desde **dist** si el paquete exporta.
- Si `task.transition` no aplica el gate, invocar explícitamente la CLI `qcli run --gate --source artifacts --scope minor` antes de `dev → review` y abortar si `passed=false`.

---

## 3) Plantilla de código (mínima, orientativa)
> El agente debe adaptarla a las rutas/exportaciones reales del repo.

```ts
// tooling/smoke/e2e-minor-fasttrack.ts
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function runCmd(cmd: string, args: string[], cwd = process.cwd()) {
  return new Promise<void>((res, rej) => {
    const p = spawn(cmd, args, { cwd, shell: false, stdio: 'inherit' })
    p.on('exit', code => code === 0 ? res() : rej(new Error(cmd + ' exit ' + code)))
  })
}

async function readJson<T>(p: string) {
  return JSON.parse(await readFile(resolve(p), 'utf8')) as T
}

async function main() {
  // 1) Generar artefactos
  await runCmd('pnpm', ['q:tests'])
  await runCmd('pnpm', ['q:coverage'])
  await runCmd('pnpm', ['q:lint'])
  await runCmd('pnpm', ['q:complexity'])

  const tests = await readJson<any>('.qreport/tests.json')
  const coverage = await readJson<any>('.qreport/coverage.json')
  const lint = await readJson<any>('.qreport/lint.json')
  const complexity = await readJson<any>('.qreport/complexity.json')

  // 2) Evidencia para dev→review
  const rgrLog = [ { step:'red', at:new Date().toISOString() }, { step:'green', at:new Date().toISOString() } ]
  const evidence = {
    rgr_log: rgrLog,
    coverage: { lines: coverage.total?.lines ?? coverage.lines },
    lint: { errors: lint.errors ?? lint.summary?.errors ?? 0 },
    complexity: { max: complexity.maxCyclomatic ?? complexity.metrics?.max }
  }

  // 3) Crear y transicionar tarea usando MCP tools del Task MCP
  const tools = await import(resolve('services/task-mcp/src/mcp/tools.ts'))
  const createRes: any = await tools.handleToolCall('task.create', {
    title: 'E2E smoke minor fast-track',
    scope: 'minor',
    acceptance_criteria: ['Debe pasar quality gate minor', 'Debe crear PR']
  })
  const id = createRes.id

  // po→dev (si el dominio lo requiere)
  try { await tools.handleToolCall('task.transition', { id, from: 'po', to: 'dev', evidence: { brief: 'fast-track demo' } }) } catch {}

  // Gate explícito si la transición no lo invoca
  await runCmd('pnpm', ['q:gate', '--', '--source', 'artifacts', '--scope', 'minor'])

  await tools.handleToolCall('task.transition', { id, from: 'dev', to: 'review', evidence: evidence })
  await tools.handleToolCall('task.transition', { id, from: 'review', to: 'po_check', evidence: { violations: [] } })
  await tools.handleToolCall('task.transition', { id, from: 'po_check', to: 'qa', evidence: { acceptance_criteria_met: true } })
  await tools.handleToolCall('task.transition', { id, from: 'qa', to: 'pr', evidence: { qa_report: { pass: true } } })
  await tools.handleToolCall('task.transition', { id, from: 'pr', to: 'done', evidence: { merged: true } })

  const final = await tools.handleToolCall('task.get', { id })
  console.log(JSON.stringify({ id, final }, null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
```

---

## 4) Comandos para ejecutar el smoke (PowerShell)
```powershell
corepack enable
pnpm i
pnpm -r build

# Arrancar servidor Quality MCP (opcional para probar HTTP/SSE)
$env:QUALITY_MCP_KEYS='abc123:run'
$env:QUALITY_PRETTY_LOGS='true'
pnpm -C tooling/quality-mcp/server start

# Ventana 2: ejecutar harness E2E
pnpm exec tsx tooling/smoke/e2e-minor-fasttrack.ts

# Validar gate explícitamente si quieres doble chequeo
pnpm q:gate --source artifacts --scope minor
pnpm q:gate --source artifacts --scope major
```

---

## 5) Qué revisar al final
- `stdout` del harness con `{ id, final }` y `status: "done"`.
- Eventos (si existen): `state.events` muestra handoffs y `quality.gate`.
- En `.qreport/`: que los artefactos y `gate.json` estén presentes y `passed: true`.

---

## 6) Criterios de aceptación del E2E
- Harness ejecuta sin errores y deja la tarea en `done`.
- Gate verde (minor y major) sin tocar umbrales.
- Server HTTP responde 200 y SSE funciona (si se probó).
- Sin regresiones en `q:complexity` ni nuevos errores de lint/tests.

