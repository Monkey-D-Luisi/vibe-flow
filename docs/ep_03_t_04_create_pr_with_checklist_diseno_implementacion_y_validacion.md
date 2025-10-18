# EP03-T04 — Create PR with Checklist (Diseño, Implementación y Validación)

## 1) Contexto
Esta tarea pertenece a la épica **EP03: GitHub Integration and PR Bot**. El objetivo es que **PR-Bot** cree automáticamente un Pull Request que incluya un **checklist de verificación** con los elementos clave de calidad y entrega: **criterios de aceptación (ACs)**, **ADR/arquitectura**, **QA/tests** y **métricas** (coverage, lint, RGR). Además, el contenido debe ser **determinista e idempotente**, alineado con los requestId persistentes del conector GitHub.

## 2) Objetivos
- Generar un **PR body** con secciones y checklist marcadas/pendientes según los datos reales de la tarea.
- Incluir **enlaces** y metadatos útiles (p. ej., `Closes #<issue>` si hay `links.github.issueNumber`).
- Mantener compatibilidad con el diseño de **idempotencia** ya implementado para todas las operaciones GitHub.
- No cambiar el contrato de `pr_summary.schema.json` (el campo `checklist` sigue existiendo y refleja lo mismo que el cuerpo del PR).

### Fuera de alcance
- No se exige resolver automáticamente conflictos de merge ni aplicar formatting al contenido de ADRs.
- No se forzará idioma; por defecto español en títulos/etiquetas.

## 3) Historias de usuario
**Como** equipo de agentes
**quiero** que cada PR incluya un checklist de calidad actualizado
**para** revisar de un vistazo el estado de ACs, ADR, QA y métricas antes de promover a *Ready for review*.

## 4) Fuente de datos
| Campo | Origen | Observaciones |
|---|---|---|
| ACs | `TaskRecord.acceptance_criteria: string[]` | Se listan tal cual. Se marcan como hechos si la tarea está en `pr/qa/done` o si `acceptance_criteria_met=true` en evidencia de transición.
| ADR | `TaskRecord.links.adr?: string[]` **o** detección por patrón `ADR-\d+` en `description`/ACs | Si no se encuentran, se muestra “N/A” y el ítem queda desmarcado.
| Coverage | `TaskRecord.metrics.coverage: number` | Se compara con el umbral por `scope` (`major ≥ 0.80`, `minor ≥ 0.70`).
| Lint | `TaskRecord.metrics.lint.errors: number` | 0 errores para marcar como hecho.
| RGR | `TaskRecord.red_green_refactor_log: string[]` | **≥ 2** entradas para marcar.
| QA | `TaskRecord.qa_report { total, passed, failed }` | Aprobado si `failed === 0`.
| Issue | `TaskRecord.links.github.issueNumber?: number` | Se añade `Closes #<issueNumber>`.

> Nota: si la instancia necesita ADR explícitos, se recomienda poblar `TaskRecord.links.adr` durante la transición `arch->dev` o `dev->review`.

## 5) Plantilla del PR body
El PR-Bot compondrá el cuerpo del PR en **Markdown** con esta estructura:

```markdown
## {task.title}
**Task ID:** {task.id}
**Scope:** {task.scope}

### Contexto
{task.description ?? ""}

### Checklist
- [ {x| } ] ACs registrados ({acCount})
- [ {x| } ] ADR referenciados ({adrCount > 0 ? adrList : "N/A"})
- [ {x| } ] RGR log (entradas: {rgrCount})
- [ {x| } ] Coverage ≥ {targetPct}% (actual: {actualPct})
- [ {x| } ] Lint 0 errores (actual: {lintErrors})
- [ {x| } ] QA sin fallos ({passed}/{total})

### Calidad (resumen)
- coverage: {actualPct}
- lint errors: {lintErrors}
- RGR entries: {rgrCount}
- QA: {passed}/{total} tests passed

{issueNumber ? `Closes #${issueNumber}` : ""}
```

- Las casillas se **autocompletan** en función de los datos disponibles.
- Si un dato está ausente, se muestra `N/A` y la casilla queda desmarcada.
- `targetPct` = `80` para `major`, `70` para `minor`.

## 6) Reglas de marcado del checklist
- **ACs**: `[x]` si hay al menos 1 AC y la transición a `pr` incluyó `acceptance_criteria_met=true` o si la tarea está en `qa/done`.
- **ADR**: `[x]` si `links.adr` tiene entradas o se detectan referencias `ADR-*` en texto. El listado se limita a **máx. 5** ítems visibles; el resto se comprime con `…`.
- **RGR**: `[x]` si `red_green_refactor_log.length >= 2`.
- **Coverage**: `[x]` si `metrics.coverage >= threshold(scope)`.
- **Lint**: `[x]` si `metrics.lint.errors === 0`.
- **QA**: `[x]` si `qa_report.failed === 0` y `total > 0`.

## 7) Diseño técnico
### 7.1 Cambios en el agente `PrBotAgent`
- **Enriquecer `buildChecklist(task)`** para incluir el ítem **ADR**:
  - Leer `task.links.adr?: string[]`.
  - Si está vacío, escanear `task.description` y `acceptance_criteria` con `/\bADR-\d+\b/g`.
  - Componer `"[x] ADR referenciados (ADR-001, ADR-007)"` o `"[ ] ADR referenciados (N/A)"`.
- **`buildPrBody(task)`**: incorporar la sección **“### Checklist”** con el marcado anterior (manteniendo la sección “### Calidad”).
- Mantener la semántica de **idempotencia** ya activa: el `openPR` continúa firmándose con `requestId` estable, y el comentario de calidad se conserva independiente.

### 7.2 Esquema/datos
- Sin cambios obligatorios en esquemas. `links.adr?: string[]` es **opcional**; si no existe, se usa la detección por patrón.

### 7.3 Rendimiento y límites
- Limitar listas largas (ACs/ADR) a 5-7 entradas en la vista principal del **body** para evitar PRs kilométricos. La lista completa de ACs permanece listada en la sección “ACs” si ya se imprime (actualmente se imprimen todas, mantener comportamiento y truncar solo el *display* del checklist si fuera necesario).

## 8) Pruebas
### 8.1 Unitarias (`services/task-mcp/test/agents.prbot.test.ts`)
- Verifica que `summary.checklist` contenga **ADR**, marcado correctamente según `links.adr` o detección por patrón.
- Verifica el **body del PR**: contiene la sección **“### Checklist”** y cada línea corresponde con el estado calculado.
- Mantiene las aserciones existentes de **idempotencia** (requestId por labels, reviewers, project-status, comentarios, removeLabel).

### 8.2 Smoke
- E2E orquestado con una tarea de ejemplo que incluya: ACs, `coverage=0.82`, `lint.errors=0`, `qa_report.failed=0`, `links.adr=["ADR-001","ADR-004"]`.
- Confirmar en el PR renderizado que el checklist refleja los estados `[x]` esperados y que `Closes #<issue>` aparece cuando hay `issueNumber`.

## 9) Observabilidad
- Mantener registro de evento `type: 'github'` cuando se abra el PR, con `payload.checklist` y `payload.requestIds`.
- Log de advertencia si la sección ADR queda vacía y `fasttrack.metadata.adrChanged === true`, para no perder trazabilidad.

## 10) Plan de despliegue
1. Implementar cambios en `PrBotAgent` y tests.
2. Ejecutar `pnpm --filter @agents/task-mcp test` y `pnpm --filter @agents/task-mcp lint`.
3. Smoke local con el orquestador + repos de pruebas.
4. Merge a `main` tras pasar **green-tests**.

## 11) Checklist de entrega (DoD)
- [ ] PR body incluye **“### Checklist”** con ACs, ADR, RGR, Coverage, Lint y QA.
- [ ] Marcado `[x]`/`[ ]` coherente con datos reales de la tarea.
- [ ] Idempotencia preservada (sin cambios en `requestId` salvo payload).
- [ ] Tests unitarios actualizados y en verde.
- [ ] Smoke validado con un PR real en entorno de prueba.

## 12) Riesgos y mitigaciones
- **Datos incompletos**: mostrar `N/A` y dejar pendiente. Mitigación: warning en logs.
- **Crecimiento del body**: truncar listados en checklist.
- **Inconsistencia entre checklist (corto) y detalle (largo)**: mantener reglas claras en comentarios del código y tests de snapshot parciales.

---
**Resumen:** Tras esta tarea, cada PR creado por el bot incluirá un checklist accionable y autoevaluado. Esto reduce fricción de revisión, hace visibles los criterios de calidad y mantiene el flujo automatizado listo para promoción a *Ready for review* cuando el gate esté en verde.

