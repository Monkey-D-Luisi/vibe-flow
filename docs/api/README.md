# OpenClaw Plugin API Reference

This directory contains the comprehensive API reference for building OpenClaw
extensions. Each file covers one area of the plugin API.

## Quick Reference

| Method | Category | Description |
|--------|----------|-------------|
| [`api.registerTool()`](tools.md) | Tools | Register a tool with schema and handler |
| [`api.on()`](hooks.md) | Hooks | Listen to lifecycle events |
| [`api.registerHttpRoute()`](http.md) | HTTP | Register HTTP endpoints |
| [`api.registerService()`](services.md) | Services | Register background services |
| [`api.registerCommand()`](services.md#registercommand) | Commands | Register chat slash commands |
| [`api.pluginConfig`](configuration.md#pluginconfig) | Config | Per-plugin configuration |
| [`api.config`](configuration.md#config) | Config | Global gateway configuration |
| [`api.logger`](configuration.md#logger) | Logging | Structured logger instance |
| [`api.resolvePath()`](configuration.md#resolvepath) | Paths | Resolve workspace-relative paths |

## Plugin Structure

Every OpenClaw extension is a default export with this shape:

```typescript
export default {
  id: 'my-extension',
  name: 'My Extension',
  description: 'What this extension does',

  register(api: OpenClawPluginApi): void {
    // Register tools, hooks, routes, services, commands
  },
};
```

The gateway calls `register(api)` once during startup. The `api` object provides
all the methods documented in this reference.

## Manifest

Each extension includes an `openclaw.plugin.json` manifest:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "0.1.0",
  "description": "What this extension does",
  "configSchema": {
    "type": "object",
    "properties": {
      "myOption": { "type": "string", "description": "Example option" }
    }
  },
  "skills": ["../../skills/my-skill"]
}
```

- `configSchema` (optional): JSON Schema validated against the plugin entry in
  `openclaw.json`.
- `skills` (optional): Paths to skill prompt directories linked to this extension.

## Files

| File | Contents |
|------|----------|
| [tools.md](tools.md) | Tool registration: `api.registerTool()` |
| [hooks.md](hooks.md) | Lifecycle hooks: `api.on()` |
| [http.md](http.md) | HTTP routes: `api.registerHttpRoute()` |
| [services.md](services.md) | Services and commands: `api.registerService()`, `api.registerCommand()` |
| [configuration.md](configuration.md) | Configuration, logging, path resolution |
| [examples.md](examples.md) | Complete working extension examples |

## Real-World Extensions

| Extension | Pattern | Source |
|-----------|---------|--------|
| product-team | Tools + HTTP + Hooks + Services | `extensions/product-team/src/index.ts` |
| quality-gate | Tools only (stateless) | `extensions/quality-gate/src/index.ts` |
| telegram-notifier | Hooks + Commands + Services | `extensions/telegram-notifier/src/index.ts` |
| model-router | Hooks + HTTP | `extensions/model-router/src/index.ts` |
| stitch-bridge | Tools only (MCP bridge) | `extensions/stitch-bridge/src/index.ts` |
| virtual-office | Hooks + HTTP (SSE) | `extensions/virtual-office/src/index.ts` |
