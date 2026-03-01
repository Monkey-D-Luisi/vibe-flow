# Walkthrough 0038 -- Expanded Agent Roster with Per-Agent Model Routing

## Goal (restated)
Expand the 6-agent roster to 10 agents with per-agent model differentiation,
differentiated tool allow-lists, and skill bindings. Each role gets the
primary model best suited to its cognitive profile.

## Decisions
- **Per-agent model differentiation**: Each agent gets a primary model tailored
  to its role, with cross-provider fallbacks for resilience:
  - PM → `openai-codex/gpt-5.2` (strategic planning, language-heavy)
  - Tech Lead → `anthropic/claude-opus-4-6` (architecture, deep reasoning)
  - PO → `openai-codex/gpt-4.1` (balanced, product decisions)
  - Designer → `openai-codex/gpt-4o` (visual reasoning, UI patterns)
  - Devs/QA/DevOps → `anthropic/claude-sonnet-4-6` (code generation, default chain)
- **Default fallback chain**: `anthropic/claude-sonnet-4-6` →
  `openai-codex/gpt-5.2` → `github-copilot/gpt-4o`. Agents that don't override
  inherit this chain. Agents with overrides specify their own fallback order.
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
- Per-agent primary model with role-appropriate fallbacks
- Workspace path
- Skill references
- Tool allow-list

Agent roster with model assignments:
1. `pm` — Product Manager (`openai-codex/gpt-5.2` → Sonnet 4-6 → Copilot gpt-4o)
2. `tech-lead` — Tech Lead (`anthropic/claude-opus-4-6` → Codex gpt-5.2 → Copilot gpt-4o)
3. `po` — Product Owner (`openai-codex/gpt-4.1` → Sonnet 4-6 → Copilot gpt-4o)
4. `designer` — UI/UX Designer (`openai-codex/gpt-4o` → Sonnet 4-6 → Copilot gpt-4o)
5. `back-1` — Senior Backend Dev (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
6. `back-2` — Junior Backend Dev (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
7. `front-1` — Senior Frontend Dev (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
8. `front-2` — Junior Frontend Dev (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
9. `qa` — QA Engineer (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)
10. `devops` — DevOps Engineer (Sonnet 4-6 → Codex gpt-5.2 → Copilot gpt-4o)

## Files Changed
- `openclaw.docker.json` — Full 10-agent roster under `agents.list`, per-agent
  model differentiation for PM, Tech Lead, PO, and Designer
- `docs/tasks/0038-agent-roster-model-routing.md` — Updated context, per-agent
  model table, D1 agent configs, D2 model router notes, acceptance criteria

## Follow-ups
- Task 0041: Skills for new roles (tech-lead, product-owner, ui-designer,
  frontend-dev, backend-dev, devops)
- Validate tool allow-lists once new tools are implemented
- Adjust per-agent model assignments as provider subscriptions evolve
