# EP03 · T02 — Conector GitHub MCP + PR Bot Sync

> **Objetivo**: conectar el orquestador con GitHub vía herramientas MCP idempotentes (Octokit) y sincronizar PRs (rama, etiquetas, estado de Project, revisores, comentarios y promoción a _Ready for review_) desde el **PR-Bot**.

---

## 1) Contexto

EP03 busca que los agentes puedan abrir y mantener PRs sin intervención humana, con coherencia en nombres de rama, etiquetas y estado del Project V2. La T01 cerró el auto-branch `feature/<task-id>-<slug>`; esta T02 conecta de verdad con GitHub y automatiza el ciclo de vida de la PR.

---

## 2) Alcance (MVP)

- **Herramientas MCP** expuestas por `task-mcp`:
  - `gh.createBranch`, `gh.openPR`, `gh.comment`, `gh.addLabels`, `gh.setProjectStatus`, `gh.readyForReview`.
- **Servicio GitHub** con Octokit + plugins `retry` y `throttling`.
- **Idempotencia** por `requestId` + huella del payload en **SQLite** (`github_requests`).
- **PR-Bot** crea PR en _draft_, etiqueta, comenta sumario de calidad, pide revisores, actualiza Project y promueve a _Ready for review_ tras el gate.
- **Project V2**: seteo de campo de estado (p. ej. `In Review`, `In Progress`, `Done`).
- **Estado del orquestador**: eventos `github` registrados para auditoría.

> Fuera de alcance: merge automático, backport, gestión de conflictos, publicación de releases.

---

## 3) Diseño técnico

### 3.1 Herramientas MCP (contratos)

Input validado vía **Ajv** (schemas de `mcp/tools.ts`). Campos comunes: `owner`, `repo`, `requestId` y `taskId` opcional.

- **`gh.createBranch`** → crea rama desde `base` y protege si procede.
- **`gh.openPR`** → abre PR _draft_ con `title`, `head`, `base`, `body`, `labels`, `assignees`.
- **`gh.addLabels` / `gh.comment`** → etiqueta y comenta en Issue/PR.
- **`gh.setProjectStatus`** → asigna valor en el campo single-select del Project V2.
- **`gh.readyForReview`** → quita el _draft_.

### 3.2 Servicio GitHub

- **Octokit** con `@octokit/plugin-retry` y `@octokit/plugin-throttling`.
- Errores envueltos con mensajes útiles (`getErrorMessage`) y tolerancia a 404 en operaciones **idempotentes** (p. ej. eliminar etiqueta inexistente no rompe).
- **Lectura de refs** con manejo claro de 404.

### 3.3 Idempotencia (clave)

Tabla `github_requests`:

```
request_id TEXT PK
tool       TEXT
payload_hash TEXT
response_json TEXT
created_at TEXT
```

- **requestId** es la clave dura. Patrón: `prbot:<taskId>:<acción>[:<contexto>][:<hash>]`.
- **Contexto** incluye el **issueNumber** cuando aplica para aislar PRs.
- **hash** = huella SHA-256 del **payload normalizado** (orden estable de claves/arrays), para que el orden de etiquetas/listas no cambie el ID.

### 3.4 PR-Bot (responsabilidades)

1. **Rama**: `feature/<task-id>-<slug(title)>` con `slug` limitado (48) y `base = main` por defecto.
2. **PR (draft)** con título `<taskId>: <title> (scope: <scope>)` y cuerpo con:
   - ACs como checklist, contexto, métricas de calidad (coverage, lint), RGR y resumen QA.
   - `Closes #<issueNumber>` si existe.
3. **Etiquetas** calculadas por config + tags del Task:
   - `area_github`, `agent_pr-bot`, `task`,
   - estado (`in-review`, `ready-for-qa`),
   - fast-track (`fast-track`, `fast-track:eligible|incompatible|revoked`),
   - `quality_gate_failed` cuando toca.
   - Se **eliminan** las gestionadas por el bot que no apliquen.
4. **Reviewers**: admite usuarios y `team/<slug>`; orden y duplicados normalizados.
5. **Project V2**: mapea estado del Task → `In Progress`/`In Review`/`Done`.
6. **Comentario de calidad**: resumen Coverage/Lint/QA/RGR.
7. **Ready for review**: solo si estado `pr` y **no** hay `quality_gate_failed`.

> Todo lo anterior genera eventos `github` en el journal del orquestador.

### 3.5 Diseño de `requestId`

- **open-pr**: `prbot:<taskId>:open-pr:<hash(head, base, labels, assignees)>`
- **labels**: `prbot:<taskId>:labels:<issueNumber>:<hash(sortedLabels)>`
- **reviewers**: `prbot:<taskId>:reviewers:<pullNumber>:<hash({reviewers,teamReviewers})>`
- **project-status**: `prbot:<taskId>:project-status:<issueNumber>:<hash({id,field,value})>`
- **quality-comment**: `prbot:<taskId>:quality-comment:<issueNumber>:<hash(body)>`

Consistencia: siempre que hay PR/issue, el **número** va en el ID. El hash evita colisiones por reorden.

---

## 4) Configuración

- **Tokens**: `PR_TOKEN` o `GITHUB_TOKEN` (mínimo: `repo`, `pull_request`, `project`, `issues`). Para App, instalar en el repo y otorgar permisos equivalentes.
- **Config del bot**: `GITHUB_PR_BOT_CONFIG` → JSON (`services/task-mcp/src/github/config.ts`).
  - `defaultBase`, `project: { id, statusField }`,
  - `labels` (mapa), `assignees`, `reviewers`, `gateCheckName`.

---

## 5) Orquestación

- Estados relevantes: `dev → review → po_check → qa → pr → done`.
- El PR-Bot corre en `review|po_check|qa|pr`.
- Transiciones validadas por `TaskRecordValidator` y Quality Gate.

---

## 6) CI/Workflow

- **`.github/workflows/pr-bot.yml`**: dispara `scripts/pr-bot-sync.mjs` ante eventos de PR y al completar `quality-gate`. Mantiene labels y Project en sincronía aunque el orquestador no esté activo.

---

## 7) Pruebas

### 7.1 Unitarias

- `agents.prbot.test.ts`:
  - Verifica creación de rama/PR.
  - Verifica **requestId** con `issueNumber` embebido y hashes estables.
  - Re-orden de labels/reviewers no cambia `requestId`.
  - `readyForReview` no se llama si `quality_gate_failed`.
- `fasttrack-github.test.ts`: comentarios/labels correctos en evaluación y revocación.
- Handlers MCP: validación de esquemas y errores legibles.

### 7.2 Integración

- Simular repo con `GithubService` _mock_ y assert de idempotencia consultando `github_requests`.

### 7.3 E2E (smoke)

1. Crear Task vía `01-create-task.ts`.
2. Generar `.qreport/*`.
3. `02-dev-to-review.ts` abre PR (draft) con etiquetas, comentario y Project.
4. `03-advance-rest.ts` avanza a `pr` y el bot marca _Ready for review_ si procede.

Artefactos: capturar números de PR, estado de Project y contenido de comentarios.

---

## 8) Aceptación (DoD)

- Herramientas MCP disponibles y **documentadas**.
- PR creada en _draft_ con título/cuerpo estándar.
- Etiquetas añadidas y **limpieza** de etiquetas gestionadas por bot.
- Comentario de calidad publicado.
- Project V2 actualizado al estado correcto.
- Reviewers solicitados.
- Ready for review aplicado cuando aplica.
- Repeticiones con el mismo payload **no** crean efectos secundarios (idempotencia).
- Eventos `github` registrados.
- Suite `@agents/task-mcp` en verde.

---

## 9) Observabilidad y errores

- Logs de cada llamada GitHub con `requestId`.
- En 404 benignos (quitar etiqueta inexistente) no se interrumpe el flujo.
- Mensajes de error normalizados en `GithubService`.

---

## 10) Riesgos y mitigaciones

- **Rate limit**: plugins `throttling/retry` + backoff.
- **Permisos insuficientes**: checklist de scopes y prueba de App/Token.
- **Esquemas MCP rotos**: tests + validación Ajv.
- **Colisiones de idempotencia**: inclusión de `issueNumber` + hash de payload normalizado.

---

## 11) Plan de despliegue / rollback

1. Desplegar `task-mcp` con migraciones (crea `github_requests`).
2. Probar en un repo sandbox.
3. Activar en proyectos reales.
4. Rollback: desactivar variables de entorno y/o feature flag del bot; la DB queda intacta.

---

## 12) Tareas (granulares)

- [ ] Esquemas y handlers MCP terminados.
- [ ] `GithubService` con retry/throttle y mensajes de error.
- [ ] Tabla `github_requests` + normalización para hash.
- [ ] PR-Bot: abrir PR, etiquetas, reviewers, comentario, Project, ready-for-review.
- [ ] Eventos `github` en journal.
- [ ] Unit tests (PR-Bot, FastTrack, handlers) verdes.
- [ ] Smoke E2E documentado.
- [ ] Guía rápida de configuración (tokens/App, config JSON).

---

## 13) Checklist de verificación manual

- [ ] Se crea rama `feature/<task-id>-…`.
- [ ] PR en draft con ACs y calidad.
- [ ] Etiquetas correctas y sin residuos.
- [ ] Estado de Project actualizado.
- [ ] Reviewers solicitados (usuarios y equipos).
- [ ] Comentario de calidad visible.
- [ ] _Ready for review_ tras gate.
- [ ] Reintento de las mismas acciones no duplica nada.

---

## 14) Notas de implementación

- Los **`requestId`** para `project-status`, `labels`, `reviewers` y `comment` **incluyen `issueNumber`** para evitar colisiones entre PRs del mismo task.
- Normalización de payload/arrays para huellas estables.
- Slug del branch limitado a 48 chars para dejar sitio al `<task-id>`.

