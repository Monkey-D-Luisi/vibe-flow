# EP03‑T05 · PR en draft si QA no pasa, y sólo salir de draft con QA + Review

## 1) Resumen ejecutivo
Queremos que ninguna PR salga de **draft** hasta que:
1) **QA pase** (tests verdes, sin fallos) y
2) Exista **al menos una aprobación de review**.

El PR‑Bot seguirá **creando** las PRs en *draft* (como hoy), y sólo las promoverá a *Ready for review* cuando se cumplan las dos condiciones. Además, dejaremos preparada la vía para volver a *draft* si se revierte cualquiera de las dos (opcional en esta tarea).

---

## 2) Objetivo y alcance
**Objetivo**: endurecer el gate de “ready for review”.

**En alcance**
- PRs creadas siempre como *draft*.
- Promoción automática a *Ready for review* sólo si `QA OK` **y** `Review Approved`.
- Idempotencia: ningún cambio si el estado ya coincide con la decisión.
- Configuración mínima en `github.pr-bot.json` para controlar las reglas.

**Fuera de alcance (opcional/fase siguiente)**
- Volver a *draft* si los checks se ponen rojos o se revoca la aprobación (lo dejamos descrito y pre‑cableado, pero no bloquea esta tarea).

---

## 3) Estado actual (antes de la tarea)
- El **PR‑Bot** crea la PR como *draft* y la marca *Ready for review* si `status === 'pr'` y **no** hay etiqueta `quality_gate_failed`.
- Existe el workflow de sincronía (`pr-bot-sync`) que ya re‑etiqueta y comenta, y puede actuar cuando el orquestador no está corriendo.
- No se comprueba recuento real de **aprobaciones** de review.

Dolor: una PR podría salir de *draft* sólo por no tener `quality_gate_failed`, aun sin evidencia de **QA OK** ni **aprobaciones**.

---

## 4) Diseño propuesto
### 4.1 Reglas de promoción
Una PR sólo se marca *Ready for review* si **todas**:
- **QA OK**: existe `qa_report` con `total > 0` y `failed === 0` (o un check requerido verde, ver 4.3), y
- **Review Approved**: al menos `minApprovals` aprobaciones efectivas (no descartadas) en GitHub.

Si alguna no se cumple, la PR permanece en *draft*.

### 4.2 Cambios en PR‑Bot (mínimos y seguros)
1) Mantener creación **siempre en draft**.
2) En la rama de “marcar ready”: sustituir la condición actual por:
   - `qaPassed(task)` **y** `approvals >= minApprovals`.
3) `qaPassed(task)` se calcula desde `task.qa_report` (mismo criterio que el checklist). Si no hay datos, no se promueve.
4) `approvals` se delega a **pr-bot-sync** (ver 4.3) para no introducir llamadas adicionales desde el orquestador. El agente recibirá el evento ya “evaluado”.

> Nota: mantenemos la idempotencia de `gh.readyForReview` (requestId estable) y evitamos bucles.

### 4.3 Extensión del workflow `pr-bot-sync`
En `services/task-mcp/scripts/pr-bot-sync.mjs`:
- Escuchar eventos `pull_request`, `pull_request_review`, `check_suite` y `workflow_run`.
- Resolver **aprobaciones** con `octokit.pulls.listReviews` y contar `APPROVED` no descartados.
- Resolver **QA OK** por dos vías (OR):
  - `task.qa_report` agregado por el orquestador (si disponible), o
  - checks de CI verdes para nombres configurados (p.ej. `green-tests`, `quality-gate`).
- Si `QA OK && approvals >= minApprovals` y la PR está *draft* → llamar a `gh.readyForReview` (idempotente).
- (Opcional futuro) Si la PR **no cumple** y **no** está *draft* → `convertToDraft` (podemos añadir una tool `gh.convertToDraft` o usar Octokit directo en el workflow).

### 4.4 Configuración
Añadir a `services/task-mcp/src/github/config.ts` (y `github.pr-bot.json`):
```jsonc
{
  "ready": {
    "requireQaPass": true,
    "requireReviewApproval": true,
    "minApprovals": 1
  },
  "checks": {
    "qaWorkflowNames": ["green-tests", "quality-gate"]
  }
}
```
- **minApprovals**: entero (por defecto 1). 0 reproduce el comportamiento actual.
- **qaWorkflowNames**: lista de checks que consideramos QA para el camino alterno sin `qa_report`.

### 4.5 Idempotencia y seguridad
- Todas las llamadas MCP a GitHub ya llevan `requestId`. No generamos nuevas rutas que rompan eso.
- La promoción sólo ocurre cuando hay **cambio real** de estado.

---

## 5) Cambios concretos en código (propuesta)
> Los nombres exactos pueden ajustarse al código existente; se indica intención y puntos de inserción.

1) **PR‑Bot** (`PrBotAgent.run`)
   - Reemplazar la condición:
     ```ts
     if (task.status === 'pr' && !this.hasQualityGateFailure(task)) {
       // antes → siempre marcaba ready si pasaba este if
     }
     ```
     por:
     ```ts
     const qaOk = this.qaPassed(task); // usa qa_report
     const approvalsOk = await this.approvalsSatisfied(owner, repo, prResult.number);
     if (task.status === 'pr' && qaOk && approvalsOk) {
       await this.github.markReadyForReview(...);
     }
     ```
   - `approvalsSatisfied` aquí puede ser *no-op* y devolverse siempre `false`; la activación real se hace desde `pr-bot-sync` (evento externo). Alternativa: implementar ahora `github.getApprovalCount` (Octokit) y usarlo.

2) **pr-bot-sync**
   - Añadir utilidades:
     - `getApprovalCount(owner, repo, pull_number)`
     - `checksAreGreen(owner, repo, head_sha, names[])`
   - Decidir y llamar a `gh.readyForReview` cuando corresponda.

3) **Config**
   - Extender `GithubPrBotConfig` con `ready` y `checks` (ver 4.4).

4) **(Opcional)** Tool MCP `gh.convertToDraft`
   - Input: `{ owner, repo, pullNumber, requestId }`.
   - Útil para revertir a *draft* si se caen QA o aprobaciones.

---

## 6) Criterios de aceptación
- **CA1**: Todas las PRs se crean en **draft**.
- **CA2**: Una PR **no** sale de draft si `qa_report` falta o `failed > 0`.
- **CA3**: Una PR **no** sale de draft si no hay el mínimo de aprobaciones configuradas.
- **CA4**: Cuando `QA OK` **y** `minApprovals` se cumplen, el bot marca la PR como **Ready for review** automáticamente.
- **CA5**: Idempotencia: eventos repetidos **no** producen cambios extra ni errores.
- **CA6**: Tests unitarios cubren las combinaciones `QA x Review` y la condición de promoción.

---

## 7) Plan de pruebas
### 7.1 Unit
- `qaPassed`: true si `{total>0, failed=0}`; false con `{total=0}` o `failed>0` o sin `qa_report`.
- `approvalsSatisfied`: true con `>= minApprovals` no descartadas; false en otro caso.
- `PrBotAgent`: no llama a `readyForReview` salvo que ambas sean true.

### 7.2 E2E/Smoke
1) Crear task y ejecutar orquestador hasta crear PR (*draft* asegurado).
2) Lanzar workflow de tests: mantener rojo → PR sigue *draft*.
3) Poner verde y **sin** approvals → PR sigue *draft*.
4) Registrar 1 approval → `pr-bot-sync` marca *Ready for review*.
5) (Opcional) Revocar approval o romper tests → verificar que queda *draft* si implementamos `convertToDraft`.

Comandos típicos:
- `pnpm --filter @agents/task-mcp test`
- `pnpm tsx tooling/smoke/e2e-pr-bot.ts` (ampliar para approvals mockeadas o usar repo de pruebas)

---

## 8) Riesgos y mitigación
- **Falsos negativos de QA**: si el orquestador no sube `qa_report`, dependemos de checks de CI. Mitigación: `qaWorkflowNames` y logs claros.
- **Permisos del token**: lectura de reviews/checks requiere scopes adecuados en el workflow/bot.
- **Flapping**: estados que cambian rápido. Idempotencia y *debounce* por evento en `pr-bot-sync`.

---

## 9) Rollout y configuración
1) Merge de cambios en `task-mcp` y `scripts/pr-bot-sync.mjs`.
2) Actualizar `github.pr-bot.json` con:
   - `ready.requireQaPass=true`
   - `ready.requireReviewApproval=true`
   - `ready.minApprovals=1`
   - `checks.qaWorkflowNames=["green-tests","quality-gate"]`
3) Verificar el workflow y permisos.
4) Probar en una PR de prueba.

---

## 10) Definition of Done
- Código y tests en verde.
- Config desplegada y leída por el servicio.
- PRs nuevas se crean en **draft**.
- Promoción automática sólo con `QA OK` + `minApprovals`.
- Documentado en README/ADR si procede.

---

## 11) Checklist de entrega
- [ ] Extensión de `GithubPrBotConfig` y carga de config
- [ ] Lógica de gating actualizada en PR‑Bot o delegada al sync
- [ ] Reglas añadidas en `pr-bot-sync`
- [ ] Tests unitarios
- [ ] Smoke local con PR de prueba
- [ ] Config aplicada en entorno

