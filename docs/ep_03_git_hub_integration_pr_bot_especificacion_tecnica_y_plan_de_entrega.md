# EP03 — Integración con GitHub y PR‑Bot (MCP)

## Objetivo
Conectar el orquestador y los agentes con GitHub para que **todo el ciclo de vida** (ramas, PRs, etiquetas, Project v2, comentarios y checks) quede **automatizado y trazable** vía **MCP**. El PR‑Bot debe:

- Abrir PRs en **draft** desde ramas generadas por agentes.
- Aplicar **labels** y **proyecto/estado** según el estado del TaskRecord.
- Publicar comentarios con **resúmenes de calidad** y decisiones de **fast‑track**.
- Sincronizar **checks requeridos** (test-lint, gate) y actualizar el PR a **Ready for review** cuando pase.
- Registrar cada acción en el **journal** de eventos.

---

## Implementación Resuelta (Octubre 2025)
- Conector Octokit (`services/task-mcp/src/github/service.ts`): tools `gh.*` con idempotencia persistente (`github_requests`), autenticación App/PAT, retries y helpers para labels/comentarios/proyecto/checks.
- Handlers MCP (`githubHandlers.ts`): expone `gh.createBranch|openPR|comment|addLabels|setProjectStatus|readyForReview` y emite eventos `github` en el journal.
- PR-Bot Agent (`agents/prbot.ts`): genera rama `feature/<task-id>-<slug>`, crea PR draft, sincroniza labels/assignees/reviewers, publica resumen de quality gate, alinea Project v2 y eleva a Ready for review tras el gate.
- Orquestador (`orchestrator/runner.ts`): reemplaza mocks, integra `PrBotAgent`, mapea repo/PR en `TaskRecord` y reutiliza `FastTrackGitHub` con el conector real.
- Script CI (`services/task-mcp/scripts/pr-bot-sync.mjs`): consume el payload de GitHub Actions, busca el TaskRecord por `links.git.prNumber` y reprocesa PR-Bot para mantener sync fuera del orquestador interactivo.
- Workflow (`.github/workflows/pr-bot.yml`): ejecuta `pr-bot-sync.mjs` para eventos `pull_request` y `workflow_run:quality-gate` con credenciales de App o PAT.
- Pruebas: unitarias para `GithubService`, handlers MCP y `PrBotAgent`; se actualizan smokes (fast-track/runner) y se añaden contratos de idempotencia.
- Documentación: README y este EP detallan el flujo final.

---

## Alcance
**Incluye**
- Conector GitHub (MCP server) con tools JSON‑RPC y schemas validados.
- PR‑Bot como agente que consume el conector y las decisiones del orquestador.
- Workflows de GitHub Actions mínimos para checks y sincronización.
- Mapeo TaskRecord → Labels/Project v2/Status.

**Queda fuera**
- Publicación externa del conector fuera del monorepo (reutiliza el servidor MCP existente).
- Automatización de release notes.

---

## Arquitectura
```
services/task-mcp (orquestador)
  └─ agents/
     ├─ pr-bot/                   # agente PR‑Bot (policy + playbooks)
     └─ github-connector-client/  # client MCP para tools gh.*

tooling/quality-mcp-server        # servidor HTTP MCP (ya existente)

services/github-mcp/              # capa de tools gh.* (si se separa)
  └─ src/
     ├─ tools/gh.createBranch.ts
     ├─ tools/gh.openPR.ts
     ├─ tools/gh.comment.ts
     ├─ tools/gh.addLabels.ts
     ├─ tools/gh.setProjectStatus.ts
     ├─ tools/gh.checks.upsert.ts (opcional)
     └─ octokit.ts (auth, rate limit, retries)
```

**Autenticación**
- Preferente **GitHub App** (mejor granularidad). Alternativa: **PAT** clásico.
- Secrets:
  - `GH_APP_ID`, `GH_APP_PRIVATE_KEY`, `GH_APP_INSTALLATION_ID` **o** `GITHUB_TOKEN`/`PR_TOKEN`.
  - `PROJECT_SYNC_TOKEN` (solo si el Project v2 es privado y de usuario individual).

**Rate limit y resiliencia**
- Retries exponenciales (413/429/5xx), backoff con jitter.
- Idempotencia por `requestId` en tools; detección de duplicados por misma rama/PR.

---

## Contratos MCP (schemas)
> Todos con `additionalProperties:false`. Los `owner/repo` pueden venir del TaskRecord `links.github`.

### `gh.createBranch`
**Input**
```json
{
  "owner": "string",
  "repo": "string",
  "base": "string",
  "name": "string",
  "protect": false,
  "requestId": "string"
}
```
**Output**
```json
{ "url": "string", "commit": "string", "created": true }
```

### `gh.openPR`
**Input**
```json
{
  "owner": "string",
  "repo": "string",
  "title": "string",
  "head": "string",
  "base": "string",
  "body": "string",
  "draft": true,
  "labels": ["string"],
  "assignees": ["string"],
  "linkTaskId": "TR-...",
  "requestId": "string"
}
```
**Output**
```json
{ "number": 123, "url": "string", "draft": true }
```

### `gh.comment`
**Input**
```json
{ "owner": "string", "repo": "string", "issueNumber": 1, "body": "string" }
```
**Output**
```json
{ "id": 999, "url": "string" }
```

### `gh.addLabels`
**Input**
```json
{ "owner": "string", "repo": "string", "issueNumber": 1, "labels": ["string"] }
```
**Output**
```json
{ "applied": ["string"] }
```

### `gh.setProjectStatus`
**Input**
```json
{
  "owner": "string",
  "repo": "string",
  "issueNumber": 1,
  "project": { "id": "string", "field": "Status", "value": "In Progress" }
}
```
**Output**
```json
{ "ok": true }
```

### `gh.checks.upsert` (opcional)
Permite actualizar un **Check Run** con métricas del `quality.gate`.
**Input**
```json
{
  "owner": "string",
  "repo": "string",
  "sha": "string",
  "name": "quality-gate",
  "status": "queued|in_progress|completed",
  "conclusion": "success|failure|neutral",
  "summary": "string",
  "detailsUrl": "string"
}
```
**Output**
```json
{ "id": 12345, "url": "string" }
```

---

## Reglas de negocio del PR‑Bot
1. **Creación de rama**: `feature/<task-id>-<slug>`.
2. **Apertura de PR**: siempre en **draft**. Auto‑body incluye:
   - ACs, scope, `rgr_log` último, métricas agregadas si existen.
   - `Closes #<issue>` si el TaskRecord enlaza issue.
3. **Etiquetado**
   - `fast-track` si elegible; `fast-track:incompatible`/`revoked` según guard post‑dev.
   - Por estado: `in-review`, `ready-for-qa`, `quality_gate_failed`.
   - Por área: `area_github`, `agent_pr-bot`, etc.
4. **Project v2**
   - Mapeo: `po|arch|dev → In Progress`, `review|po_check|qa|pr → In Review`, `done → Done`.
5. **Comentarios automatizados**
   - Resultado del **fast‑track** (score, razones, hardBlocks).
   - Resultado del **quality.gate** con tabla: tests/coverage/lint/complexity y `violations`.
   - Mensajes de **revocación** si post‑dev falla.
6. **Transiciones**
   - Cuando Actions marca `gate` como ok y `draft=true`, PR‑Bot cambia a **Ready for review**.
7. **Trazabilidad**
   - Cada invocación emite evento en `event_log` con `type: "github"` y payload.

---

## Workflows de CI/CD
### `ci.yml` (existente)
- Jobs: `test-lint`, `quality-gate`.
- Requisito de branch protection: ambos deben pasar.

### `project-sync.yml`
- Mover items entre columnas por estado (ignora si falta el tablero configurado).

### `pr-bot.yml` (nuevo)
```yaml
name: pr-bot
on:
  pull_request:
    types: [opened, ready_for_review, synchronize, reopened]
  workflow_run:
    workflows: [quality-gate]
    types: [completed]
jobs:
  update-pr:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      checks: write
      issues: write
      projects: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: corepack enable && pnpm i --filter @agents/task-mcp --filter @agents/quality-mcp-server
      - name: Sync labels/project/comments
        run: |
          node services/task-mcp/scripts/pr-bot-sync.mjs "$GITHUB_EVENT_PATH"
        env:
          QUALITY_MCP_KEYS: "runner:run|read"
          # App/PAT envs aquí (GH_APP_ID, GH_APP_PRIVATE_KEY, GH_APP_INSTALLATION_ID o PR_TOKEN)
```

---

## Configuración y secretos
Archivo `services/task-mcp/config/github.pr-bot.json`:
```json
{
  "defaultBase": "main",
  "project": { "id": "PVT_xxx", "statusField": "Status" },
  "labels": {
    "fastTrack": "fast-track",
    "fastTrackEligible": "fast-track:eligible",
    "fastTrackIncompatible": "fast-track:incompatible",
    "fastTrackRevoked": "fast-track:revoked",
    "qualityFailed": "quality_gate_failed"
  },
  "assignees": ["monkey-d-luisi"],
  "reviewers": ["team/devs"],
  "gateCheckName": "quality-gate"
}
```

---

## E2E: flujo esperado
1. `task.create` → estado `po`.
2. Fast‑track eval: si minor y pasa, `po → dev` directo; si no, `po → arch`.
3. Dev sube rama y PR‑Bot crea **draft PR** + etiquetas + comentario de fast‑track.
4. `q:tests`, `q:coverage`, `q:lint`, `q:complexity` → `quality-gate`.
5. Gate pasa: PR‑Bot quita `quality_gate_failed` y hace **Ready for review**; si falla, comenta violaciones.
6. `review → po_check → qa → pr → done` con actualizaciones de Project v2.

---

## Estrategia de pruebas
- **Unitarias (Vitest)**: mock Octokit; contratos ajv; reintentos y manejo de errores.
- **Contract tests**: validar que cada tool gh.* cumple el schema.
- **E2E smoke**: script `tooling/smoke/e2e-pr-bot.ts` que:
  - Crea TaskRecord, abre PR, aplica labels, escribe comentario, actualiza Project v2.
  - Lee el journal y asserta los eventos `github.*` esperados.

---

## Criterios de aceptación (DoD)
- Tools `gh.*` implementadas y registradas (schemas + ajv).
- PR‑Bot abre PR en **draft**, etiqueta y sincroniza Project v2.
- Comentarios automáticos: fast‑track, quality gate, revocación.
- Ready for review automático al pasar gate.
- Eventos de journal consistentes.
- Documentación en README y `docs/ep_03_*`.

---

## Plan de PR
**Rama**: `feature/ep03-github-pr-bot`

**Título**: `EP03: GitHub MCP integration & PR‑Bot`

**Descripción**
```
- Connector gh.* (schemas, tools, retries, auth App/PAT).
- Agente PR‑Bot con playbooks (open, label, comment, project sync, ready‑for‑review).
- Workflow pr-bot.yml.
- Tests unitarios + e2e smoke.
```

**Labels**: `epic_EP03`, `area_github`, `agent_pr-bot`, `task`.

**Auto‑cierre**: `Closes #63` (conectar MCP/Connector).

---

## Riesgos y mitigaciones
- **Rate limits**: retries con `Retry-After`, cola pLimit, cache de GETs.
- **Permisos insuficientes**: matriz de scopes por modo App/PAT y prueba de conectividad en arranque.
- **Tableros privados**: uso de `PROJECT_SYNC_TOKEN` cuando aplique.
- **Idempotencia**: `requestId` y búsquedas previas de PR por rama.

---

## Anexos
### Plantillas
**Título PR**: `EPxx-Tyy: <resumen> (scope: <minor|major>)`

**Cuerpo PR**:
```
### Contexto
<breve>

### ACs
- [ ] ...

### Calidad
- coverage: X%
- lint: 0 errores
- RGR: presente

Closes #<issue>
```

