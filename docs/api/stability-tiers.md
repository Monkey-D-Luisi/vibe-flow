# Stability Tiers

Every public API method is classified into one of three stability tiers. This
guide explains each tier and lists the current classification for every method.

## Tier definitions

### Stable

> Will not break within a major version.

- Breaking changes require 2 minor versions of deprecation warnings plus a
  major version bump.
- Safe to depend on for production extensions.

### Beta

> May change in minor versions with 1 minor version notice.

- The API shape is mostly settled but may be adjusted based on feedback.
- A deprecation warning is logged for at least 1 minor version before changes.

### Experimental

> May change or be removed at any time.

- Used for new features gathering feedback.
- No backwards-compatibility guarantee.
- Do not depend on in production extensions without accepting the risk.

## Current classifications

### Tool registration

| Method | Tier | Since |
|--------|------|-------|
| `api.registerTool(definition)` | **Stable** | 1.0 |

### Hook / event system

| Method | Tier | Since |
|--------|------|-------|
| `api.on(event, handler)` | **Stable** | 1.0 |

**Stable events:**

| Event | Tier | Since |
|-------|------|-------|
| `before_tool_call` | **Stable** | 1.0 |
| `after_tool_call` | **Stable** | 1.0 |
| `agent_end` | **Stable** | 1.0 |
| `subagent_spawned` | **Beta** | 1.0 |
| `before_model_resolve` | **Beta** | 1.0 |

### HTTP routes

| Method | Tier | Since |
|--------|------|-------|
| `api.registerHttpRoute(config)` | **Stable** | 1.0 |

### Services and commands

| Method | Tier | Since |
|--------|------|-------|
| `api.registerService(service)` | **Stable** | 1.0 |
| `api.registerCommand(command)` | **Beta** | 1.0 |

### Configuration and utilities

| Method | Tier | Since |
|--------|------|-------|
| `api.pluginConfig(key, fallback)` | **Stable** | 1.0 |
| `api.config` | **Stable** | 1.0 |
| `api.logger` | **Stable** | 1.0 |
| `api.resolvePath(relative)` | **Stable** | 1.0 |

### Advanced / runtime

| Method | Tier | Since |
|--------|------|-------|
| `api.runtime` | **Experimental** | 1.0 |

## Promoting a tier

To propose promoting an API from Experimental → Beta or Beta → Stable:

1. Open an issue with the `api-promotion` label.
2. Demonstrate that the criteria in
   [versioning-policy.md](versioning-policy.md) are met.
3. An ADR is recorded in `docs/adr/` once approved.
