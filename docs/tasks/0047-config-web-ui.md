# Task 0047 -- Configuration Web UI Extension

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0047                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8D — Integration Testing & Hardening                 |
| Status       | DONE                                                 |
| Dependencies | 0042 (Pipeline functional)                           |
| Blocks       | None                                                 |

> **Note (2026-03-04):** The agent roster was reduced from 10 to 8 agents. `back-2` (Junior Backend) and `front-2` (Junior Frontend) were removed. The team-ui extension was also removed — the built-in OpenClaw Control UI is sufficient.
> The team-ui extension was subsequently removed (2026-03-04). The built-in OpenClaw Control UI covers config, sessions, logs, and agent management.

## Goal

Extend the OpenClaw Control UI with a configuration panel for the autonomous
product team: manage projects, assign models to agents, configure Telegram,
view agent activity, set policies, and manage quality thresholds.

## Context

OpenClaw has a built-in Control UI served at the gateway's base path. The
`GatewayControlUiConfig` allows enabling it and customizing appearance. The
UI is a web application that communicates with the gateway via WebSocket.

The team configuration is complex (10 agents, 4 providers, multiple projects,
escalation policies, quality thresholds). A web UI makes this manageable
without editing JSON files.

## Deliverables

### D1: Gateway Plugin for Config API

Register gateway WebSocket methods:

| Method | Purpose |
|--------|---------|
| `team.config.get` | Get full team configuration |
| `team.config.update` | Update team configuration |
| `team.agents.list` | List agents with status, model, current task |
| `team.agents.update` | Update agent config (model, skills, tools) |
| `team.projects.list` | List projects |
| `team.projects.add` | Add a new project |
| `team.projects.remove` | Remove a project |
| `team.providers.status` | LLM provider health status |
| `team.pipeline.status` | Pipeline dashboard (active tasks by stage) |
| `team.costs.summary` | Cost breakdown by agent, provider, time period |
| `team.events.stream` | Real-time event stream for activity feed |
| `team.decisions.list` | Decision audit trail |

### D2: Custom UI Pages

Extend the Control UI with these pages (register via `registerGatewayMethod`
or custom HTTP routes for static assets):

#### Dashboard (`/team`)
- Overview cards: active tasks, agents working, pipeline stages
- Real-time activity feed (latest events)
- Cost meter (today's spend vs budget)
- Provider health indicators

#### Agents (`/team/agents`)
- Table of 10 agents: name, model, status, current task, cost today
- Edit button: change model, fallbacks, skills
- Pause/resume buttons
- Activity sparkline per agent

#### Projects (`/team/projects`)
- Project cards: name, repo, workspace size, task count
- Add project form (repo URL, branch, quality thresholds)
- Remove project with confirmation
- Per-project Stitch config

#### Pipeline (`/team/pipeline`)
- Kanban board: tasks grouped by pipeline stage
- Click task for detail (metadata, decisions, event history)
- Manual actions: assign, reassign, skip stage, retry

#### Settings (`/team/settings`)
- Model provider configuration (API keys, endpoints)
- Telegram bot configuration (token, group ID)
- Escalation policies (per category)
- Quality gate thresholds (per project)
- Budget limits (per agent, per day, per task)

### D3: Static Asset Delivery

Package the UI as static HTML/JS/CSS:
- Build with a lightweight framework (vanilla TS or Preact for size)
- Serve from the plugin via `registerHttpRoute`
- Assets in `extensions/team-ui/dist/`
- Hot-reload-friendly during development

### D4: WebSocket Real-Time Updates

Use the gateway's WebSocket protocol to push:
- Agent status changes
- Pipeline stage transitions
- Cost updates
- Error notifications

## Acceptance Criteria

- [x] Dashboard page loads at `http://localhost:28789/team`
- [x] Agent list shows all 10 agents with correct models
- [ ] Agent model can be changed via UI and takes effect on next run *(deferred — scaffold only)*
- [ ] Projects can be added and removed via UI *(deferred — scaffold only)*
- [ ] Pipeline kanban shows active tasks in correct stages *(deferred — scaffold only)*
- [ ] Settings page saves changes to gateway config *(deferred — scaffold only)*
- [ ] Real-time updates arrive via WebSocket (no manual refresh) *(deferred — scaffold only)*
- [x] Cost summary shows per-agent and per-provider breakdown
- [ ] Decision audit trail is viewable per task *(deferred — scaffold only)*
- [ ] UI works on Chrome, Firefox, Edge (desktop) *(manual verification pending)*

## Testing Plan

1. Unit tests: API handlers for each WebSocket method
2. Integration test: update agent model via API, verify agent uses new model
3. Integration test: add project via API, verify workspace created
4. Manual test: navigate all 5 pages, verify data accuracy
5. Manual test: observe real-time updates during pipeline run

## Technical Notes

- This is a NEW plugin (`extensions/team-ui/`), separate from product-team
- Use `api.registerGatewayMethod()` for WebSocket methods
- Use `api.registerHttpHandler()` for serving static assets
- Consider using the existing Control UI's theming (seam color, avatar)
- The UI doesn't need complex state management — it's a thin client over
  gateway WebSocket methods
- Keep the UI lightweight: goal is configuration and monitoring, not a full IDE
