# EP01 -- OpenClaw Foundation

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| Epic        | EP01                                             |
| Status      | PENDING                                          |
| Priority    | P0                                               |
| Phase       | 1 -- Foundation                                  |
| Target      | March 2026                                       |
| Depends on  | None                                             |
| Blocks      | (all other epics depend on the gateway running)  |

## Goal

Gateway operational with authentication, multi-agent routing by role, and tool
policies that restrict each agent to its authorized surface area.

## Context

The product-team system requires a runtime that boots agents, routes messages,
enforces tool allow-lists, and manages channels. OpenClaw provides this out of
the box, eliminating the need for custom MCP server infrastructure.

## Tasks

### 1.1 Gateway setup and configuration

- Install OpenClaw gateway
- Create `openclaw.json` at repo root
- Configure plugin path (`./extensions/product-team`)
- Replace local `OpenClawPluginApi` subset in `extensions/product-team/src/index.ts`
  with the real interface from `openclaw/plugin-sdk` (includes `registerHook`,
  `registerHttpHandler`, `registerChannel`, and `OpenClawConfig` type for `config`)
- Verify gateway boots without errors

**Acceptance Criteria:**
- `openclaw start` launches successfully
- Plugin is loaded and reports ready
- Plugin uses the real `OpenClawPluginApi` from `openclaw/plugin-sdk`, no local subset

### 1.2 Agent definitions

- Define all six agents: pm, architect, dev, qa, reviewer, infra
- Each agent has id, name, description, skills path
- Skills directories exist with SKILL.md files

**Acceptance Criteria:**
- All six agents listed in `openclaw.json`
- Each agent's skill directory contains a valid SKILL.md

### 1.3 Tool policies per role

> **Caveat:** The current `openclaw.json` uses `agents.list` with `tools.allow`
> per role, but OpenClaw's real schema uses `agents.list` for gateway instances
> (bots/channels), not for role definitions with tool policies. OpenClaw currently
> ignores these unknown sections. Before implementing this task, research how
> OpenClaw actually supports tool policies for plugins and adapt the config
> accordingly. The intent (restrict each role to its tool surface) is correct;
> the schema syntax needs to be aligned with the real API.

- Research OpenClaw's actual mechanism for tool policies on custom plugin tools
- Adapt `openclaw.json` to use the correct schema
- Configure tool allow-lists for each agent:
  - PM: task.create, task.get, task.search, task.update, task.transition
  - Architect: task.get, task.update, task.transition, workflow.state.get
  - Dev: task.get, task.update, task.transition, quality.*, workflow.*
  - QA: task.get, task.update, task.transition, quality.*
  - Reviewer: task.get, task.update, task.transition
  - Infra: vcs.*, task.get, task.transition

**Acceptance Criteria:**
- Each agent can only invoke its allowed tools
- Attempting to call a disallowed tool returns a policy error
- `openclaw.json` uses OpenClaw's real schema for agent/tool configuration

### 1.4 Sandbox configuration

- Configure environment isolation
- Set working directory per agent
- Configure temp file policies

**Acceptance Criteria:**
- Agents operate in isolated contexts
- No cross-agent file leakage

## Future Considerations

> These items come from the deep-research report. Not blocking for EP01 but
> should be addressed before production.

- **Separate `hooks.token`**: OpenClaw webhooks should use a dedicated token,
  not the gateway token. Configure `hooks.allowedAgentIds` to restrict which
  agents can be triggered by external events.
- **`optional: true` for side-effect tools**: mark tools that mutate external
  state (GitHub, exec) as `optional` in `registerTool()` to require explicit
  opt-in per session.
- **Pairing for remote access**: if the gateway is exposed beyond loopback,
  configure device pairing and trusted proxies.

## Out of Scope

- Tool implementation (EP02+)
- Workflow logic (EP03)
- CI/CD hooks (EP04)

## References

- [Roadmap](../roadmap.md)
- [ADR-001](../adr/ADR-001-migrate-from-mcp-to-openclaw.md)
