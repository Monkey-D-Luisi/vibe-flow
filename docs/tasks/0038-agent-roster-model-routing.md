# Task 0038 -- Expanded Agent Roster with Per-Agent Model Routing

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0038                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8A — Infrastructure                                  |
| Status       | PENDING                                              |
| Dependencies | 0035, 0036 (Docker + models ready)                   |
| Blocks       | 0039, 0040, 0041 (Phase 8B needs full roster)        |

## Goal

Expand the current 6-agent roster to 10 agents with differentiated roles,
per-agent model assignments, tool allow-lists, and skill bindings. Implement
the `before_model_resolve` hook to dynamically route each agent to its
configured primary model with fallback chain.

## Context

The current `openclaw.docker.json` defines 10 agents sharing the default model
fallback chain (`anthropic/claude-sonnet-4-6` → `openai-codex/gpt-5.2` →
`github-copilot/gpt-4o`). Auth is managed via OpenClaw's native auth-profiles
system: Anthropic (token), OpenAI-Codex (OAuth), GitHub Copilot (token).

The working agent at `~/.openclaw` demonstrates this pattern: a single default
`{ primary, fallbacks }` chain that all agents share, with the runtime
automatically handling provider auth (token refresh for OAuth, proxy token
rotation for Copilot). Per-agent model differentiation is optional and can
be added later as provider subscriptions evolve.

## Deliverables

### D1: Agent Definitions (in `openclaw.docker.json`)

```jsonc
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-6",
        "fallbacks": [
          "openai-codex/gpt-5.2",
          "github-copilot/gpt-4o"
        ]
      },
      "sandbox": {
        "mode": "non-main",
        "scope": "agent",
        "workspaceAccess": "rw"
      }
    },
    "list": [
      {
        "id": "pm",
        "name": "Product Manager",
        "default": true,
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["requirements-grooming"],
        "tools": {
          "allow": [
            "task.create", "task.get", "task.search", "task.update",
            "task.transition", "workflow.events.query",
            "project.list", "project.switch",
            "team.assign", "team.status", "team.message",
            "pipeline.start", "pipeline.status",
            "decision.evaluate", "decision.log"
          ]
        }
      },
      {
        "id": "tech-lead",
        "name": "Tech Lead",
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["tech-lead", "architecture-design", "code-review", "adr"],
        "tools": {
          "allow": [
            "task.create", "task.get", "task.search", "task.update",
            "task.transition", "workflow.step.run", "workflow.state.get",
            "workflow.events.query", "quality.gate",
            "team.assign", "team.status", "team.message", "team.inbox", "team.reply",
            "project.list", "project.switch",
            "pipeline.status", "pipeline.retry", "pipeline.skip",
            "decision.evaluate", "decision.log"
          ]
        }
      },
      {
        "id": "po",
        "name": "Product Owner",
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["product-owner", "requirements-grooming"],
        "tools": {
          "allow": [
            "task.create", "task.get", "task.search", "task.update",
            "task.transition", "workflow.step.run", "workflow.state.get",
            "team.message", "team.inbox", "team.reply", "team.status",
            "decision.evaluate", "decision.log"
          ]
        }
      },
      {
        "id": "designer",
        "name": "UI/UX Designer",
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["ui-designer"],
        "tools": {
          "allow": [
            "task.get", "task.update", "task.transition",
            "workflow.step.run", "workflow.state.get",
            "design.generate", "design.edit", "design.get", "design.list"
          ]
        }
      },
      {
        "id": "back-1",
        "name": "Senior Backend Developer",
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["tdd-implementation", "patterns"],
        "tools": {
          "allow": [
            "task.get", "task.update", "task.transition",
            "workflow.step.run", "workflow.state.get",
            "quality.tests", "quality.coverage", "quality.lint",
            "quality.complexity", "quality.gate"
          ]
        }
      },
      {
        "id": "back-2",
        "name": "Junior Backend Developer",
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["tdd-implementation"],
        "tools": {
          "allow": [
            "task.get", "task.update", "task.transition",
            "workflow.step.run", "workflow.state.get",
            "quality.tests", "quality.coverage", "quality.lint",
            "quality.complexity", "quality.gate"
          ]
        }
      },
      {
        "id": "front-1",
        "name": "Senior Frontend Developer",
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["tdd-implementation", "frontend-dev"],
        "tools": {
          "allow": [
            "task.get", "task.update", "task.transition",
            "workflow.step.run", "workflow.state.get",
            "quality.tests", "quality.coverage", "quality.lint",
            "quality.complexity", "quality.gate",
            "design.get", "design.list"
          ]
        }
      },
      {
        "id": "front-2",
        "name": "Junior Frontend Developer",
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["tdd-implementation", "frontend-dev"],
        "tools": {
          "allow": [
            "task.get", "task.update", "task.transition",
            "workflow.step.run", "workflow.state.get",
            "quality.tests", "quality.coverage", "quality.lint",
            "quality.complexity", "quality.gate",
            "design.get", "design.list"
          ]
        }
      },
      {
        "id": "qa",
        "name": "QA Engineer",
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["qa-testing"],
        "tools": {
          "allow": [
            "task.get", "task.update", "task.transition",
            "workflow.step.run", "workflow.state.get",
            "quality.tests", "quality.coverage", "quality.lint",
            "quality.complexity", "quality.gate",
            "workflow.events.query"
          ]
        }
      },
      {
        "id": "devops",
        "name": "DevOps Engineer",
        "model": { "primary": "anthropic/claude-sonnet-4-6", "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"] },
        "workspace": "/workspaces/active",
        "skills": ["github-automation"],
        "tools": {
          "allow": [
            "vcs.branch.create", "vcs.pr.create", "vcs.pr.update",
            "vcs.label.sync", "task.get", "task.search", "task.update",
            "task.transition", "workflow.state.get", "workflow.events.query",
            "project.list", "project.switch"
          ]
        }
      }
    ]
  }
}
```

### D2: Model Router Plugin (`extensions/model-router/`)

The plugin registers the `GET /api/providers/health` endpoint. It checks
connectivity to all configured providers: `anthropic`, `openai-codex`,
`github-copilot`, and `openai-transcription`.

**Static routing is handled natively** by OpenClaw via `agents.list[].model`
with `{ primary, fallbacks }`. Auth profiles (token, OAuth, copilot-proxy)
are managed by the runtime. No custom `before_model_resolve` hook is needed
for static per-agent model assignment.

The hook is reserved for future dynamic routing logic (cost optimization,
task complexity scoring, provider fail-over based on real-time health).

**Note:** Since all agents currently share the same fallback chain (matching
the working agent), the `before_model_resolve` hook adds no value yet. When
per-agent differentiation is needed (e.g., Opus for Tech Lead, GPT-5.x for
PM), add `model` overrides to individual agent entries in the config.

### D3: Agent Binding Configuration

Route Telegram group messages to the `pm` agent by default:

```jsonc
{
  "routing": {
    "bindings": [
      {
        "agentId": "pm",
        "match": { "channel": "telegram", "peer": { "kind": "group" } }
      }
    ]
  }
}
```

### D4: Telemetry Labels

Each agent should include its role in cost tracking labels, so the cost
dashboard can break down spend per role.

## Acceptance Criteria

- [ ] All 10 agents defined in gateway config with correct fallback chain
- [ ] Default model: `anthropic/claude-sonnet-4-6` with fallbacks `openai-codex/gpt-5.2`, `github-copilot/gpt-4o`
- [ ] Auth profiles configured: anthropic (token), openai-codex (oauth), github-copilot (token)
- [ ] Fallback activates when primary model returns error/timeout
- [ ] Tool allow-lists enforce role boundaries (agent denied if calling unauthorized tool)
- [ ] PM agent receives messages from Telegram group (routing binding)
- [ ] Skills are correctly bound to each agent
- [ ] Cost tracking labels identify per-agent spend
- [ ] Provider health check covers all providers (anthropic, openai-codex, github-copilot, openai-transcription)
- [ ] Total agent count: 10 (exact roster match)

## Testing Plan

1. Start gateway with 10-agent config and auth profiles
2. Run `openclaw auth login anthropic`, `openclaw auth login openai-codex`, `openclaw auth login github-copilot`
3. For each agent: send a test prompt, verify `llm_input` hook logs the correct model
4. Test tool policy: have `designer` try to call `vcs.pr.create` (should be denied)
5. Test fallback: temporarily revoke Anthropic token, verify agents fall back to openai-codex/gpt-5.2
6. Verify Telegram routing: send message in group, confirm PM agent responds
7. Call `GET /api/providers/health` — all 5 providers should report connected
