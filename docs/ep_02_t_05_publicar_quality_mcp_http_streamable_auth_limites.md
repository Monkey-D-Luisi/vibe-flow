# EP02‑T05 — Publicar **Quality MCP** (HTTP streamable + autenticación + límites)

## Objetivo

Exponer el **Quality MCP** como servicio HTTP con:

- **Invocación de tools** (`run_tests`, `coverage_report`, `lint`, `complexity` …)
- **Streaming** de resultados (SSE) y modo síncrono (JSON)
- **Autenticación** por API Key (y opción HMAC)
- **Límites de recursos**: timeouts, concurrencia, rate‑limit, aislamiento de procesos
- **Observabilidad**: logs estructurados, métricas, trazas
- **Despliegue** contenedorizado y CI para publicar imagen

---

## Alcance

- Servidor Node/TS con **Fastify** (o Express) + **AJV** para validar requests/responses.
- Endpoints HTTP:
  - `POST /mcp/tool` (invocación síncrona)
  - `POST /mcp/tool/stream` (SSE, Server‑Sent Events)
  - `GET  /healthz` (liveness)
  - `GET  /metrics` (Prometheus‑like, opcional)
- Autenticación: `Authorization: Bearer <API_KEY>` con **scopes** por key.
- Rate‑limit e **in‑process** (token bucket) + opción Redis si se despliega multi‑instancia.
- Aislamiento: ejecución de subtareas pesadas en **child\_process**; el resto en el event loop.
- No entra: gateway público multi‑tenant, SSO, RBAC avanzado.

---

## Contrato HTTP (JSON)

### Request común

```json
{
  "tool": "quality.run_tests",
  "input": { "cmd": "pnpm -C services/task-mcp test -- --reporter=json" },
  "requestId": "ulid",
  "stream": false
}
```

### Respuesta (síncrona)

```json
{
  "ok": true,
  "tool": "quality.run_tests",
  "result": { "total": 33, "passed": 33, "failed": 0, "durationMs": 4123, "failedTests": [], "meta": {"runner":"vitest","exitCode":0,"cwd":"/work","cmd":"..."} },
  "requestId": "ulid"
}
```

### Streaming (SSE)

- `POST /mcp/tool/stream` → `Content-Type: text/event-stream`
- Eventos:
  - `event: log` → `{ level, msg }`
  - `event: chunk` → `{ partial: any }` (trozos intermedios si la tool lo soporta)
  - `event: result` → `{ result: any }` (payload final)
  - `event: error` → `{ code, message }`

### Errores

```json
{ "ok": false, "error": { "code": "UNAUTHORIZED|FORBIDDEN|RATE_LIMIT|TIMEOUT|RUNNER_ERROR|PARSE_ERROR|VALIDATION_ERROR|NOT_FOUND", "message": "..." }, "requestId": "ulid" }
```

---

## Autenticación y autorización

- **API Keys** en `QUALITY_MCP_KEYS` (CSV `key:scope1|scope2`), p.ej. `abc123:read|run, def456:run`.
- Scopes sugeridos: `read`, `run`.
- Opción **HMAC**: cabecera `X-Signature: sha256=<hex>` sobre `timestamp + body` con secreto por key; protege contra replay con `X-Timestamp` (ventana ±5 min).
- CORS: deshabilitado por defecto; habilitar sólo orígenes conocidos.

---

## Límites de recursos

- **Rate‑limit**: token bucket (por API key). Env:
  - `QUALITY_RPS=2` (tokens/seg), `QUALITY_BURST=5` (balde)
- **Concurrencia**: `QUALITY_MAX_CONCURRENCY=2` por instancia (p‑limit).
- **Timeouts**: `QUALITY_TOOL_TIMEOUT_MS=600000` default; override por request.
- **Input size**: `maxBodySize=1mb` (configurable).
- **Ejecución de comandos**: en `child_process.spawn` con `AbortController`, sin heredar secrets; cwd y PATH controlados.
- **Contenedor**: límites de **cgroup** (CPU/mem) definidos en despliegue.

---

## Observabilidad

- **Logs** con Pino: `requestId`, `tool`, `latencyMs`, `exitCode`.
- **Métricas** `/metrics` (Prometheus): `requests_total`, `inflight`, `latency_histogram`, `tool_failures_total{code}`.
- **Event journal** (opcional): llamar a `state.append_event` con tipo `quality.run`.

---

## Estructura de código

```
/tooling/quality-mcp/
  server/
    src/
      index.ts            # arranque Fastify
      auth.ts             # parse/verify API key + HMAC
      rateLimit.ts        # token bucket in‑memory (y Redis opcional)
      router.ts           # POST /mcp/tool, /mcp/tool/stream, /healthz, /metrics
      sse.ts              # util SSE
      schemas.ts          # AJV validators para request/response
      exec.ts             # puente para invocar tools locales
    package.json
    Dockerfile
```

---

## Instrucciones de implementación

### 1) Servidor

1. **Fastify** + `fastify-sse-v2` para SSE.
2. Validar request con **AJV** (tool\:string, input\:object, requestId opcional ULID).
3. Resolver la tool a un handler local (`quality.run_tests`, `quality.coverage_report`, `quality.lint`, `quality.complexity`).
4. Envolver invocación con:
   - `p-limit` (concurrencia)
   - `AbortController` (timeout)
   - `try/catch` con mapeo de errores al contrato.
5. En `POST /mcp/tool/stream`, abrir SSE, emitir `log` al empezar, `result` o `error` al finalizar.

### 2) Seguridad

- Middleware de **API Key** y (opcional) **HMAC**; rechazar si falta/incorrecto.
- Filtrar env de los child processes (permitir solo `NODE_ENV`).
- Sanitizar valores de error antes de serializar.

### 3) Despliegue (Docker)

**Dockerfile** (resumen):

```
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm i --frozen-lockfile
COPY . .
RUN pnpm -r build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app .
EXPOSE 8080
CMD ["node","tooling/quality-mcp/server/dist/index.js"]
```

**Variables**: `PORT`, `QUALITY_MCP_KEYS`, `QUALITY_RPS`, `QUALITY_BURST`, `QUALITY_MAX_CONCURRENCY`, `QUALITY_TOOL_TIMEOUT_MS`.

### 4) CI (GitHub Actions)

`.github/workflows/quality-mcp-publish.yml`

```yaml
name: quality-mcp-publish
on:
  push:
    branches: [ main ]
    paths: [ 'tooling/quality-mcp/**', 'packages/schemas/**' ]
jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: corepack enable && pnpm i
      - run: pnpm -r build
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: tooling/quality-mcp/server/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/quality-mcp:latest
```

### 5) Pruebas locales

```bash
# Síncrono
curl -H "Authorization: Bearer abc123" \
     -H "Content-Type: application/json" \
     -d '{"tool":"quality.run_tests","input":{}}' \
     http://localhost:8080/mcp/tool | jq

# Streaming
curl -N -H "Authorization: Bearer abc123" \
     -H "Content-Type: application/json" \
     -d '{"tool":"quality.run_tests","input":{},"stream":true}' \
     http://localhost:8080/mcp/tool/stream
```

---

## Criterios de aceptación (DoD)

- Endpoints `POST /mcp/tool` y `POST /mcp/tool/stream` operativos con **auth**.
- Validación de requests/responses con AJV; errores con códigos del contrato.
- **Rate‑limit** activo por API key; **concurrencia** limitada y **timeouts** aplicados.
- Streaming SSE estable; cliente recibe `result` o `error`.
- Logs estructurados y `/healthz` OK; `/metrics` opcional expone contadores básicos.
- Imagen Docker construida y publicada en **GHCR** con workflow verde.
- README con variables, ejemplo `curl`, y guía de despliegue.

---

## Plan de PR

**Rama:** `feature/ep02-t05-quality-mcp-server`

**Título:** `EP02-T05: Publish Quality MCP — HTTP (sync + SSE), auth & limits`

**Descripción (plantilla):**

```
Contexto
- Publica el Quality MCP vía HTTP con streaming SSE, API Key, límites de recursos y Docker.

Cambios
- tooling/quality-mcp/server: Fastify + endpoints /mcp/tool y /mcp/tool/stream
- Seguridad: API Key (+ HMAC opcional), rate-limit, concurrencia, timeouts
- Observabilidad: logs estructurados, healthz, metrics
- CI: build & push a ghcr.io

Checklist
- [ ] AJV req/resp
- [ ] Auth + rate-limit
- [ ] SSE estable
- [ ] Docker image publicada
- [ ] README actualizado
```

**Labels:** `area_quality`, `epic_EP02`, `task`, `agent_dev`, `deployment`.

**Auto‑cierre:** `Closes #88`.

---

## Riesgos y mitigaciones

- **Denegación de servicio**: aplicar rate‑limit bajo por defecto; circuit breaker si `inflight` supera umbral.
- **Filtración de secretos**: filtrar env de procesos hijos y redactar logs.
- **Bloqueos por procesos largos**: usar abort/timeout y streaming.

---

## Anexos

### Esquema mínimo AJV para request HTTP

```json
{
  "type":"object","additionalProperties":false,
  "required":["tool","input"],
  "properties":{
    "tool":{"type":"string","pattern":"^quality\\.(run_tests|coverage_report|lint|complexity)$"},
    "input":{"type":"object"},
    "requestId":{"type":"string"},
    "stream":{"type":"boolean"}
  }
}
```

