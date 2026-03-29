# Configuration, Logging & Path Resolution API

Access plugin configuration, global gateway settings, structured logging, and
workspace path resolution.

---

## `api.pluginConfig` {#pluginconfig}

Per-plugin configuration object loaded from the gateway configuration file
(`openclaw.json` or `openclaw.docker.json`).

### Type

```typescript
api.pluginConfig: Record<string, unknown> | undefined
```

### How Configuration Is Provided

Plugin configuration is set in the gateway config under
`plugins.entries.<pluginId>`:

```json
{
  "plugins": {
    "entries": {
      "my-extension": {
        "myOption": "value",
        "features": {
          "enableCache": true
        }
      }
    }
  }
}
```

The extension receives this as `api.pluginConfig`:

```typescript
{
  "myOption": "value",
  "features": { "enableCache": true }
}
```

### Safe Access Pattern

Always guard access with type checking — `pluginConfig` may be `undefined` if no
configuration is provided:

```typescript
register(api: OpenClawPluginApi): void {
  const cfg = (api.pluginConfig && typeof api.pluginConfig === 'object')
    ? (api.pluginConfig as Record<string, unknown>)
    : {};

  const dbPath = typeof cfg['dbPath'] === 'string'
    ? cfg['dbPath']
    : './data/default.db';

  const enabled = cfg['enabled'] !== false;
}
```

### Example: Full Config Extraction

From the telegram-notifier extension (`extensions/telegram-notifier/src/index.ts`):

```typescript
function getConfig(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig && typeof api.pluginConfig === 'object')
    ? (api.pluginConfig as Record<string, unknown>)
    : {};

  return {
    groupId: typeof cfg['groupId'] === 'string' ? cfg['groupId'] : '',
    rateLimit: typeof cfg['rateLimit'] === 'number' ? cfg['rateLimit'] : 30,
    alerting: (cfg['alerting'] as Record<string, unknown>) ?? {},
  };
}
```

### Config Schema Validation

Declare expected configuration in `openclaw.plugin.json` using `configSchema`:

```json
{
  "id": "my-extension",
  "configSchema": {
    "type": "object",
    "properties": {
      "dbPath": { "type": "string", "description": "SQLite database path" },
      "enabled": { "type": "boolean", "description": "Enable the extension" }
    }
  }
}
```

The gateway validates plugin config against this schema at startup.

---

## `api.config` {#config}

Read-only global gateway configuration. Provides access to agent definitions,
model assignments, and other gateway-level settings.

### Type

```typescript
api.config: {
  agents?: {
    list?: Array<{
      id: string;
      name: string;
      model: string | { primary: string; fallbacks: string[] };
    }>;
  };
}
```

### Example: Read Agent List

```typescript
const agents = api.config.agents?.list ?? [];
for (const agent of agents) {
  console.log(`Agent ${agent.id}: model=${JSON.stringify(agent.model)}`);
}
```

### Example: Build Model Catalog

From the model-router extension (`extensions/model-router/src/index.ts`):

```typescript
function buildModelCatalog(api: OpenClawPluginApi): Map<string, ModelConfig> {
  const catalog = new Map<string, ModelConfig>();
  const agents = api.config.agents?.list ?? [];

  for (const agent of agents) {
    const modelConfig = typeof agent.model === 'string'
      ? { primary: agent.model, fallbacks: [] }
      : agent.model;
    catalog.set(agent.id, modelConfig);
  }

  return catalog;
}
```

---

## `api.logger` {#logger}

Structured logger instance scoped to the plugin. Supports standard log levels.

### Type

```typescript
api.logger: {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

### Example

```typescript
register(api: OpenClawPluginApi): void {
  const logger = api.logger;

  logger.info('Extension loaded');
  logger.warn('Optional feature not configured');
  logger.error(`Failed to initialize: ${errorMessage}`);
}
```

### Best Practices

- Use structured messages with context:
  ```typescript
  logger.info(`Tool registered: ${toolName}`);
  logger.error(`Database connection failed: ${error.message}`);
  ```
- Log at appropriate levels: `info` for lifecycle events, `warn` for recoverable
  issues, `error` for failures requiring attention.
- Avoid logging sensitive data (tokens, credentials, user PII).

---

## `api.resolvePath(relativePath)` {#resolvepath}

Resolve a workspace-relative path to an absolute path. Includes path traversal
protection — rejects paths containing `..` segments.

### Signature

```typescript
api.resolvePath(relativePath: string): string
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `relativePath` | `string` | Yes | Path relative to workspace root |

### Returns

Absolute path string. Throws if the path contains `..` segments (path traversal
protection).

### Example

From the product-team extension (`extensions/product-team/src/index.ts`):

```typescript
const dbPath = api.resolvePath(
  typeof pluginCfg['dbPath'] === 'string'
    ? pluginCfg['dbPath']
    : './data/product-team.db',
);
```

### Security

`resolvePath` validates that the resolved path stays within the workspace:

```typescript
// This works:
api.resolvePath('./data/my-db.sqlite');      // → /workspace/data/my-db.sqlite
api.resolvePath('extensions/my-ext/config'); // → /workspace/extensions/my-ext/config

// This throws (path traversal attempt):
api.resolvePath('../../../etc/passwd');       // → Error: invalid path
```

---

## `api.runtime` (Advanced)

Access to gateway runtime internals. This is an advanced API used for
platform-specific integrations (e.g., Telegram message sending).

### Telegram Integration

```typescript
const sendTg = api.runtime?.channel?.telegram?.sendMessageTelegram;
if (typeof sendTg === 'function') {
  await sendTg(groupId, messageText, { textMode: 'markdown' });
}
```

> **Note:** `api.runtime` is not part of the stable API. Access it defensively
> with optional chaining and type guards. See
> [stability-tiers.md](stability-tiers.md) for details.
>
> **Warning:** This API is classified as **Experimental**. It may change or be
> removed without notice. Do not depend on it in production extensions without
> accepting the risk.

---

## Cross-References

| API | Used By | Source |
|-----|---------|--------|
| `pluginConfig` | All extensions | `api.pluginConfig` in each `register()` |
| `config` | product-team, model-router | `api.config.agents?.list` |
| `logger` | All extensions | `api.logger.info/warn/error` |
| `resolvePath` | product-team | `extensions/product-team/src/index.ts` |
| `runtime` | telegram-notifier | `api.runtime?.channel?.telegram` |
