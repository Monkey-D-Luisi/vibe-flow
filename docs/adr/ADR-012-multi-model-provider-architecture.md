# ADR-012: Multi-Model Provider Architecture

## Status
Accepted

## Date
2026-03-10

## Context

The autonomous product team uses LLM calls for every pipeline stage: PM writes
product briefs, Tech Lead produces architecture plans, QA generates test
reports, etc. Different tasks have different quality and cost requirements:

- Simple tasks (status updates, message routing) can use smaller, cheaper models.
- Complex tasks (architecture decisions, code review) need more capable models.
- Provider outages should not block the entire pipeline.
- Budget constraints are real — tokens are scarce, and free-tier copilot-proxy
  is the fallback safety net.

Running all agents on a single provider/model is both wasteful and fragile.

## Decision

Implement a **multi-model provider architecture** with per-agent model
configuration and dynamic routing.

Design:

1. **Static per-agent model config** in `openclaw.json`: each agent has a
   default model assignment (e.g., pm → `gpt-4o`, qa → `claude-3-haiku`).
2. **Auth profiles** for multiple providers: OpenAI, Anthropic, Google AI,
   and copilot-proxy (free tier).
3. **Model-router extension** (`extensions/model-router/`) with a
   `before_model_resolve` hook that can dynamically override the static
   assignment based on task complexity, budget remaining, and provider health.
4. **Fallback chains**: if the primary model is unavailable, fall back through
   a configured chain ending at copilot-proxy as the last resort.
5. **Cost tracking**: every LLM call logs token consumption to the event log
   for budget enforcement and reporting.

## Alternatives Considered

### Single model for all agents

- **Pros:** Simplest configuration, predictable costs.
- **Cons:** Either too expensive (GPT-4 for status updates) or too weak
  (GPT-3.5 for architecture decisions). No resilience to provider outages.

### Client-side model selection (agent chooses its own model)

- **Pros:** Maximum flexibility for each agent.
- **Cons:** No centralized budget control. Agents would have no awareness
  of total pipeline cost. No ability to enforce downgrades when budget is low.

### Dedicated proxy service (LiteLLM, OpenRouter)

- **Pros:** Purpose-built for multi-provider routing, load balancing, caching.
- **Cons:** External dependency — violates local-first constraint. Adds
  network latency and another service to operate. The model-router extension
  provides the needed routing logic without an external service.

## Consequences

### Positive

- Cost optimization: simple tasks use cheap models, complex tasks get
  capable ones.
- Resilience: provider outages trigger automatic failover, not pipeline failure.
- Budget awareness: the routing hook integrates with budget limits (EP11)
  to automatically downgrade tiers when budget is low.
- Flexibility: adding a new provider requires only an auth profile and
  fallback chain update.

### Negative

- Configuration complexity: per-agent model assignments, fallback chains,
  and auth profiles create more knobs to tune.
- Model-specific behaviors: different models produce differently-formatted
  outputs, making JSON Schema validation more important.
- Testing requires mocking multiple providers.

### Neutral

- The `before_model_resolve` hook follows the OpenClaw extension hook pattern,
  making it consistent with other extension points in the gateway.

## References

- EP08 -- Autonomous Product Team (multi-model requirement)
- EP10 -- Dynamic Model Routing (hook activation)
- EP11 -- Budget Intelligence (cost-aware routing)
- `extensions/model-router/` — router extension implementation
- `openclaw.json` — agent model configuration
