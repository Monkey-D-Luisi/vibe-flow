# Walkthrough 0038 -- Expanded Agent Roster with Per-Agent Model Routing

## Goal (restated)
Expand the 6-agent roster to 10 agents with unified model fallback chain
(matching the working agent), differentiated tool allow-lists, and skill
bindings.

## Decisions
- **Unified fallback chain**: All agents share the same model chain:
  `anthropic/claude-sonnet-4-6` → `openai-codex/gpt-5.2` → `github-copilot/gpt-4o`.
  This matches the working agent at `~/.openclaw` which uses a single default
  chain for all operations. Per-agent differentiation (e.g., Opus for Tech Lead)
  can be added later when provider subscriptions evolve.
- **Model routing via native config**: OpenClaw's `agents.list[].model` field
  already supports `{ primary, fallbacks }` natively. No custom
  `before_model_resolve` hook plugin needed — the model-router plugin is
  reserved for future dynamic routing logic only.
- **Auth profiles (not API keys)**: Provider auth uses the runtime's
  auth-profiles system: Anthropic (token), OpenAI-Codex (OAuth with JWT +
  refresh token), GitHub Copilot (user token). This matches the working agent.
- **Tool allow-lists**: Each agent gets the minimum set of tools for its role.
  New tools (team.*, project.*, pipeline.*, decision.*, design.*) are assigned
  based on role responsibilities.
- **Workspace**: All agents share `/workspaces/active` which is a symlink to
  the currently active project workspace. Project switching (Task 0040) updates
  this symlink.
- **Removed old agents**: The `architect`, `dev`, `reviewer`, and `infra` agent
  IDs are replaced by the new roster. The `pm` and `qa` IDs remain but with
  expanded tool sets.

## Implementation
The 10-agent roster was embedded in `openclaw.docker.json` (created in Task 0035)
under the `agents.list` key. Each agent has:
- Unique ID and human-readable name
- Primary model with fallback chain (same for all: sonnet-4-6 → gpt-5.2 → gpt-4o)
- Workspace path
- Skill references
- Tool allow-list

Agent roster:
1. `pm` — Product Manager (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
2. `tech-lead` — Tech Lead (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
3. `po` — Product Owner (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
4. `designer` — UI/UX Designer (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
5. `back-1` — Senior Backend Dev (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
6. `back-2` — Junior Backend Dev (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
7. `front-1` — Senior Frontend Dev (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
8. `front-2` — Junior Frontend Dev (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
9. `qa` — QA Engineer (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
10. `devops` — DevOps Engineer (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)

## Files Changed
- `openclaw.docker.json` — Full 10-agent roster under `agents.list`, unified
  fallback chain for all agents
- `docs/tasks/0038-agent-roster-model-routing.md` — Updated context, agent
  configs, D2 model router notes, acceptance criteria, testing plan

## Follow-ups
- Task 0041: Skills for new roles (tech-lead, product-owner, ui-designer,
  frontend-dev, backend-dev, devops)
- Validate tool allow-lists once new tools are implemented
- Consider per-agent model differentiation when provider subscriptions evolve
  (e.g., Opus for Tech Lead, GPT-5.x for PM)
