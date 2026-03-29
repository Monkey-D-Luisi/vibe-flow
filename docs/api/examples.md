# Complete Extension Examples

Working examples that demonstrate common extension patterns. Each example is
self-contained and can be scaffolded with `pnpm create:extension`.

---

## Example 1: Tool-Only Extension

The simplest pattern — register one or more tools with no hooks, routes, or
services. The quality-gate extension follows this pattern.

```typescript
// extensions/word-count/src/index.ts
import type { OpenClawPluginApi } from 'openclaw';

export default {
  id: 'word-count',
  name: 'Word Count',
  description: 'Count words in text',

  register(api: OpenClawPluginApi): void {
    api.registerTool({
      name: 'word_count',
      label: 'Word Count',
      description: 'Count the number of words in the given text',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to count words in' },
        },
        required: ['text'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const text = String(params['text'] ?? '');
        const words = text.trim().split(/\s+/).filter(Boolean);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ wordCount: words.length }),
          }],
        };
      },
    });

    api.logger.info('word-count extension loaded');
  },
};
```

**Test:**

```typescript
// extensions/word-count/test/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import plugin from '../src/index.js';

describe('word-count plugin', () => {
  it('registers the word_count tool', () => {
    const registerTool = vi.fn();
    const api = {
      registerTool,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    plugin.register(api as unknown as OpenClawPluginApi);

    expect(registerTool).toHaveBeenCalledOnce();
    expect(registerTool.mock.calls[0][0].name).toBe('word_count');
  });

  it('counts words correctly', async () => {
    const registerTool = vi.fn();
    const api = {
      registerTool,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    plugin.register(api as unknown as OpenClawPluginApi);

    const tool = registerTool.mock.calls[0][0];
    const result = await tool.execute('test-id', { text: 'hello world foo' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.wordCount).toBe(3);
  });
});
```

---

## Example 2: Hook-Only Extension

Listen to lifecycle events without registering tools. The virtual-office
extension follows a variant of this pattern (hooks + HTTP).

```typescript
// extensions/activity-logger/src/index.ts
import type { OpenClawPluginApi } from 'openclaw';

export default {
  id: 'activity-logger',
  name: 'Activity Logger',
  description: 'Log all agent tool calls to console',

  register(api: OpenClawPluginApi): void {
    api.on('before_tool_call', (event, ctx) => {
      const toolName = String(event.toolName ?? 'unknown');
      const agentId = (ctx as { agentId?: string })?.agentId ?? 'unknown';
      api.logger.info(`[${agentId}] calling ${toolName}`);
    });

    api.on('after_tool_call', (event, ctx) => {
      const toolName = String(event.toolName ?? 'unknown');
      const agentId = (ctx as { agentId?: string })?.agentId ?? 'unknown';
      api.logger.info(`[${agentId}] completed ${toolName}`);
    });

    api.on('agent_end', (event, ctx) => {
      const agentId = (ctx as { agentId?: string })?.agentId ?? 'unknown';
      if (event.error) {
        api.logger.error(`[${agentId}] ended with error: ${String(event.error)}`);
      } else {
        api.logger.info(`[${agentId}] ended successfully`);
      }
    });

    api.logger.info('activity-logger extension loaded');
  },
};
```

---

## Example 3: HTTP API Extension

Expose custom REST endpoints. The model-router extension follows a variant of
this pattern (HTTP + hooks).

```typescript
// extensions/system-info/src/index.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OpenClawPluginApi } from 'openclaw';

export default {
  id: 'system-info',
  name: 'System Info',
  description: 'Expose system information via HTTP',

  register(api: OpenClawPluginApi): void {
    api.registerHttpRoute({
      path: '/api/system-info',
      auth: 'plugin',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const info = {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          timestamp: new Date().toISOString(),
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(info, null, 2));
      },
    });

    api.logger.info('system-info extension loaded');
  },
};
```

---

## Example 4: Service Extension

Run background tasks with managed lifecycle. The telegram-notifier extension
follows this pattern (services + hooks + commands).

```typescript
// extensions/health-monitor/src/index.ts
import type { OpenClawPluginApi } from 'openclaw';

export default {
  id: 'health-monitor',
  name: 'Health Monitor',
  description: 'Periodically check system health and alert on issues',

  register(api: OpenClawPluginApi): void {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const cfg = (api.pluginConfig && typeof api.pluginConfig === 'object')
      ? (api.pluginConfig as Record<string, unknown>)
      : {};
    const intervalMs = typeof cfg['intervalMs'] === 'number'
      ? cfg['intervalMs']
      : 60_000;

    api.registerService({
      id: 'health-monitor-cron',
      async start() {
        api.logger.info(`Health monitor starting (interval: ${intervalMs}ms)`);
        intervalId = setInterval(async () => {
          try {
            const memUsage = process.memoryUsage();
            const heapPercent = memUsage.heapUsed / memUsage.heapTotal;

            if (heapPercent > 0.9) {
              api.logger.warn(`High heap usage: ${(heapPercent * 100).toFixed(1)}%`);
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            api.logger.error(`Health check failed: ${msg}`);
          }
        }, intervalMs);
      },
      async stop() {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = undefined;
        }
        api.logger.info('Health monitor stopped');
      },
    });
  },
};
```

---

## Example 5: Hybrid Extension (Full-Featured)

Combines tools, hooks, HTTP routes, and services. The product-team extension
is the canonical example of this pattern.

```typescript
// extensions/analytics/src/index.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OpenClawPluginApi } from 'openclaw';

interface ToolCallRecord {
  toolName: string;
  agentId: string;
  timestamp: string;
  durationMs: number;
}

export default {
  id: 'analytics',
  name: 'Analytics',
  description: 'Track and query agent tool usage analytics',

  register(api: OpenClawPluginApi): void {
    const records: ToolCallRecord[] = [];
    const pending = new Map<string, number>();

    // --- Hook: track tool call start ---
    api.on('before_tool_call', (event, ctx) => {
      const key = `${(ctx as { agentId?: string })?.agentId}:${event.toolName}`;
      pending.set(key, Date.now());
    });

    // --- Hook: track tool call end ---
    api.on('after_tool_call', (event, ctx) => {
      const agentId = (ctx as { agentId?: string })?.agentId ?? 'unknown';
      const toolName = String(event.toolName ?? 'unknown');
      const key = `${agentId}:${toolName}`;
      const startTime = pending.get(key);
      pending.delete(key);

      records.push({
        toolName,
        agentId,
        timestamp: new Date().toISOString(),
        durationMs: startTime ? Date.now() - startTime : 0,
      });
    });

    // --- Tool: query analytics ---
    api.registerTool({
      name: 'analytics_summary',
      label: 'Analytics Summary',
      description: 'Get tool usage statistics',
      parameters: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Filter by agent ID' },
        },
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const agentFilter = params['agentId'] as string | undefined;
        const filtered = agentFilter
          ? records.filter((r) => r.agentId === agentFilter)
          : records;

        const summary = {
          totalCalls: filtered.length,
          avgDurationMs: filtered.length > 0
            ? filtered.reduce((s, r) => s + r.durationMs, 0) / filtered.length
            : 0,
        };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(summary, null, 2),
          }],
        };
      },
    });

    // --- HTTP: analytics dashboard ---
    api.registerHttpRoute({
      path: '/api/analytics',
      auth: 'plugin',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          totalRecords: records.length,
          recentCalls: records.slice(-50),
        }));
      },
    });

    api.logger.info('analytics extension loaded');
  },
};
```

---

## Extension Manifest

Every example above uses a manifest file (`openclaw.plugin.json`):

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "0.1.0",
  "description": "What this extension does",
  "configSchema": {
    "type": "object",
    "properties": {}
  }
}
```

## Gateway Configuration

Load an extension in `openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["./extensions/my-extension"]
    },
    "entries": {
      "my-extension": {
        "myOption": "value"
      }
    }
  }
}
```

## Next Steps

- [Getting Started Guide](../getting-started.md) — Build your first extension
- [API Overview](README.md) — Full API reference index
- [Versioning Policy](versioning-policy.md) — API stability guarantees
