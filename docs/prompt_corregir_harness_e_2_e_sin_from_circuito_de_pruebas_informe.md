# Prompt — Corregir harness E2E (sin `from`) + circuito de pruebas + informe

> Objetivo: ajustar el harness E2E para cumplir el schema de `task.transition` (AJV) **sin** introducir regresiones de complejidad ni tocar umbrales. Después ejecutar el circuito completo de pruebas y entregar un informe en Markdown.

---

## Contexto
- Repo: **agents-mcps** (monorepo Node/TS, ESM, pnpm)
- SO: Windows + PowerShell. Usar `pnpm q:*` o `pnpm exec tsx ...` (no `pnpm dlx`).
- Estado actual: EP01 y EP02 implementados. Servidor Quality MCP operativo. Gate en verde salvo fallos puntuales por evidencia.
- Incidencia: el harness E2E usa `task.transition` enviando campo **`from`**, pero el **schema no lo admite**. AJV responde con `VALIDATION_ERROR`.

**Decisión**: aplicar **cambio mínimo en el harness** (no tocar server ni schemas): **eliminar `from`** de todas las invocaciones a `task.transition`. El estado de origen se leerá desde la persistencia como define el dominio.

---

## Tareas (hacer en este orden)

### 1) Corregir el harness E2E
Archivo: `tooling/smoke/e2e-minor-fasttrack.ts` (o ruta actual de tu harness).

- Sustituir todas las llamadas a `task.transition` para **no** enviar `from`.

**Diff orientativo:**
```diff
- await tools.handleToolCall('task.transition', { id, from: 'po', to: 'dev', evidence: { brief: 'fast-track demo' } })
+ await tools.handleToolCall('task.transition', { id, to: 'dev', evidence: { brief: 'fast-track demo' } })

- await tools.handleToolCall('task.transition', { id, from: 'dev', to: 'review', evidence })
+ await tools.handleToolCall('task.transition', { id, to: 'review', evidence })

- await tools.handleToolCall('task.transition', { id, from: 'review', to: 'po_check', evidence: { violations: [] } })
+ await tools.handleToolCall('task.transition', { id, to: 'po_check', evidence: { violations: [] } })

- await tools.handleToolCall('task.transition', { id, from: 'po_check', to: 'qa', evidence: { acceptance_criteria_met: true } })
+ await tools.handleToolCall('task.transition', { id, to: 'qa', evidence: { acceptance_criteria_met: true } })

- await tools.handleToolCall('task.transition', { id, from: 'qa', to: 'pr', evidence: { qa_report: { pass: true } } })
+ await tools.handleToolCall('task.transition', { id, to: 'pr', evidence: { qa_report: { pass: true } } })

- await tools.handleToolCall('task.transition', { id, from: 'pr', to: 'done', evidence: { merged: true } })
+ await tools.handleToolCall('task.transition', { id, to: 'done', evidence: { merged: true } })
```

Mantener la construcción de evidencia para `dev → review` (RGR, coverage, lint, complexity) leyendo `.qreport/*`.

### 2) Circuito de artefactos de calidad
Ejecutar en la raíz del repo:
```powershell
pnpm q:tests
pnpm q:coverage
pnpm q:lint
pnpm q:complexity
pnpm q:gate --source artifacts --scope minor
pnpm q:gate --source artifacts --scope major
```
Verificar que `.qreport/gate.json` queda con `passed: true` en ambos scopes. No modificar thresholds.

### 3) Prueba del servidor Quality MCP
Arranque:
```powershell
$env:QUALITY_MCP_KEYS = 'abc123:run'
$env:QUALITY_PRETTY_LOGS = 'true'
pnpm -C tooling/quality-mcp/server start
```
Comprobaciones:
```powershell
# Síncrono
$h=@{Authorization='Bearer abc123'; 'Content-Type'='application/json'}
$body=@{ tool='quality.run_tests'; input=@{} } | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri 'http://localhost:8080/mcp/tool' -Method Post -Headers $h -Body $body

# Streaming (una sola línea)
curl.exe -N -H "Authorization: Bearer abc123" -H "Content-Type: application/json" -d "{\"tool\":\"quality.run_tests\",\"input\":{},\"stream\":true}" http://localhost:8080/mcp/tool/stream
```
Esperado: 200 en sync y eventos en SSE.

### 4) Ejecutar el harness E2E
```powershell
pnpm exec tsx tooling/smoke/e2e-minor-fasttrack.ts
```
Esperado: tarea creada `scope=minor`, handoffs completos hasta **`done`**.

### 5) Informe en Markdown
Generar un informe en `./.qreport/e2e-smoke-report.md` con:
- Fecha/hora de ejecución.
- Resumen de **artefactos**: tests, coverage (ratio líneas), lint (errores=0), complexity (avg/max).
- Resultado de **gate** en minor y major (pegar `violations` si los hubiera).
- Resultado HTTP y SSE (códigos y breve salida).
- **Timeline** de transiciones registradas para la tarea: `po → dev → review → po_check → qa → pr → done`.
- ID de la tarea y justificante de evidencia usada en `dev → review`.

Guardar el archivo y mostrar por consola la ruta: `./.qreport/e2e-smoke-report.md`.

---

## Criterios de aceptación (DoD)
- No se modifica el schema ni los umbrales de calidad.
- `task.transition` funciona sin `from` y el E2E finaliza en **`done`**.
- `pnpm q:gate` pasa en **minor** y **major**.
- Servidor HTTP responde **200** y SSE emite eventos.
- Informe generado en `./.qreport/e2e-smoke-report.md` con los apartados solicitados.
- **Sin regresiones**: tests, lint y complejidad permanecen en verde (max ≤ 12, avg ≤ 5).

---

## Commit sugerido
`fix(e2e): remove 'from' from task.transition calls in smoke harness + add E2E markdown report`

Si hay PR abierta para EP02, actualizarla; si no, abrir PR en **draft** y adjuntar el informe como artefacto/adjunto del PR.

