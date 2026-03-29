# HTTP Route API

Register HTTP endpoints served by the OpenClaw gateway. Routes handle health
checks, REST APIs, webhooks, static files, and Server-Sent Events (SSE).

## `api.registerHttpRoute(config)`

Register an HTTP endpoint.

### Signature

```typescript
api.registerHttpRoute(config: HttpRouteConfig): void
```

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | Yes | URL path (e.g., `/health`, `/api/budget`) |
| `auth` | `'plugin' \| 'public'` | Yes | Authentication mode |
| `handler` | `(req: IncomingMessage, res: ServerResponse) => Promise<void>` | Yes | Request handler |
| `match` | `'exact' \| 'prefix'` | No | Route matching strategy (default: `'exact'`) |

### Auth Modes

| Mode | Description |
|------|-------------|
| `'plugin'` | Requires gateway plugin authentication (standard for internal APIs) |
| `'public'` | No authentication required (use for webhooks, public endpoints) |

### Match Modes

| Mode | Description |
|------|-------------|
| `'exact'` | Path must match exactly (default behavior) |
| `'prefix'` | Path is treated as a prefix — matches `/path`, `/path/sub`, `/path/sub/deep` |

### Handler Signature

Handlers receive standard Node.js HTTP objects:

```typescript
async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void>
```

The handler is responsible for:
- Writing response headers with `res.writeHead(statusCode, headers)`
- Writing response body with `res.end(body)`
- Handling errors and returning appropriate status codes

---

## Example: Simple JSON Endpoint

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';

export default {
  id: 'my-api',
  name: 'My API Extension',
  description: 'Adds a custom API endpoint',

  register(api: OpenClawPluginApi): void {
    api.registerHttpRoute({
      path: '/api/status',
      auth: 'plugin',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const status = { healthy: true, timestamp: new Date().toISOString() };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
      },
    });
  },
};
```

## Example: Health Check

From the product-team extension (`extensions/product-team/src/registration/http-routes.ts`):

```typescript
api.registerHttpRoute({
  path: '/health',
  auth: 'plugin',
  handler: createHealthCheckHandler(deps),
});
```

## Example: REST API with Multiple Endpoints

From the product-team extension:

```typescript
// Query endpoint (GET)
api.registerHttpRoute({
  path: '/api/budget',
  auth: 'plugin',
  handler: createBudgetQueryHandler(budgetQuery),
});

// Mutation endpoint (POST)
api.registerHttpRoute({
  path: '/api/budget/replenish',
  auth: 'plugin',
  handler: createBudgetReplenishHandler(budgetMutation),
});

// Another query endpoint
api.registerHttpRoute({
  path: '/api/decisions',
  auth: 'plugin',
  handler: createDecisionQueryHandler(decisionQuery),
});
```

## Example: Prefix Matching with SSE

From the virtual-office extension (`extensions/virtual-office/src/index.ts`):

```typescript
api.registerHttpRoute({
  path: '/office',
  auth: 'plugin',
  match: 'prefix',
  handler: async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === '/office/events') {
      // Server-Sent Events stream
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const onState = (data: unknown) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      store.subscribe(onState);
      req.on('close', () => store.unsubscribe(onState));
      return;
    }

    // Static file serving for /office/*
    await serveStaticFile(url.pathname, res);
  },
});
```

## Example: Webhook Endpoint

From the product-team extension (CI feedback):

```typescript
api.registerHttpRoute({
  path: '/webhook/ci',
  auth: 'plugin',
  handler: async (req, res) => {
    // Parse webhook payload
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());

    // Process CI event
    await processCiWebhook(body);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  },
});
```

## Example: Provider Health Route

From the model-router extension (`extensions/model-router/src/index.ts`):

```typescript
api.registerHttpRoute({
  path: '/api/providers/health',
  auth: 'plugin',
  handler: async (_req, res) => {
    const snapshot = healthCache.getSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(snapshot));
  },
});
```

---

## Patterns

### Handler Factory

Create handler factories to inject dependencies without polluting the route
registration:

```typescript
function createMyHandler(deps: MyDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const data = await deps.queryData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
}

// In register():
api.registerHttpRoute({
  path: '/api/my-data',
  auth: 'plugin',
  handler: createMyHandler({ queryData }),
});
```

### Error Handling

Always handle errors in route handlers to avoid crashing the gateway:

```typescript
handler: async (req, res) => {
  try {
    const data = await fetchData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    api.logger.error(`Route /api/data failed: ${message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
},
```

## Cross-References

| Extension | Routes | Source |
|-----------|--------|--------|
| product-team | `/health`, `/api/budget`, `/api/decisions`, `/api/metrics`, `/api/timeline`, `/api/metrics/heatmap`, `/webhook/ci` | `extensions/product-team/src/registration/http-routes.ts` |
| model-router | `/api/providers/health` | `extensions/model-router/src/index.ts` |
| virtual-office | `/office` (prefix: SSE + static files) | `extensions/virtual-office/src/index.ts` |
