# ADR-001: Migrate from standalone MCP server to OpenClaw plugin

## Status
Accepted

## Date
2026-02-23

## Context

The original product-team system was built as a standalone MCP (Model Context
Protocol) server. While functional for single-agent prototyping, the
architecture had several fundamental limitations:

- **No agent runtime.** There was no built-in concept of multiple agents with
  distinct roles, skills, or tool policies. Routing and role enforcement had to
  be handled manually.
- **No gateway.** Each MCP server ran independently with no central
  orchestration, authentication, or rate limiting.
- **No channels.** There was no mechanism for agents to communicate with each
  other or with external systems (GitHub, Slack) through a unified interface.
- **No tool policy enforcement.** Any connected client could invoke any
  registered tool, with no role-based access control.
- **Custom infrastructure burden.** Building agent management, message routing,
  and lifecycle management from scratch was pulling focus from domain logic.

The system needed a runtime that provides multi-agent orchestration, tool
policy enforcement, skill-based routing, and channel integrations out of the
box.

## Decision

Migrate from the standalone MCP server architecture to an **OpenClaw plugin**.

Specifically:

1. **Repackage domain logic** (TaskRecord, state machine, quality gates,
   GitHub automation) as an OpenClaw plugin under `extensions/product-team/`.
2. **Define agents declaratively** in `openclaw.json` with per-role tool
   allow-lists and skill references.
3. **Use OpenClaw gateway** for agent routing, authentication, and channel
   management.
4. **Leverage OpenClaw skills** for role-specific prompting and behavior.
5. **Retire the standalone MCP server** infrastructure (custom transport,
   manual tool registration).

## Alternatives Considered

### Keep building custom MCP server

- **Pros:** Full control, no external dependencies, already partially built.
- **Cons:** Massive infrastructure investment for agent management, routing,
  policy enforcement. Would duplicate what OpenClaw provides. Single-agent
  limitation without significant rework.

### Use a different agent gateway (e.g., LangGraph, CrewAI)

- **Pros:** Established ecosystems with community support.
- **Cons:** Different paradigm (graph-based vs. tool-based), would require
  rewriting domain logic to fit their abstractions. Less alignment with MCP
  tool model that our domain logic already uses.

### Microservices architecture (one service per agent)

- **Pros:** Strong isolation, independent deployment.
- **Cons:** Enormous operational overhead for a small team. Inter-service
  communication complexity. Overkill for the current scale.

## Consequences

### Positive

- **Gateway solved.** OpenClaw provides authentication, routing, rate limiting,
  and channel management out of the box.
- **Multi-agent routing.** Each agent is a first-class citizen with declared
  skills and tool policies.
- **Tool policy enforcement.** Allow-lists prevent agents from accessing tools
  outside their role.
- **Skill system.** Role-specific behavior defined in SKILL.md files with
  structured prompting.
- **Channel integrations.** Future ability to connect GitHub, Slack, and other
  systems through OpenClaw channels.
- **Focus on domain logic.** Team can concentrate on TaskRecord lifecycle,
  quality gates, and workflow rather than infrastructure.

### Negative

- **Dependency on OpenClaw.** The system is now coupled to OpenClaw's API
  surface and release cadence. Breaking changes in OpenClaw require migration
  effort.
- **API surface learning curve.** Team needs to learn OpenClaw's plugin API,
  configuration model, and conventions.
- **Reduced flexibility.** Some architectural decisions are constrained by
  OpenClaw's opinions (e.g., tool registration patterns, config schema format).

### Neutral

- **Migration effort.** One-time cost to repackage existing domain logic.
  Most business logic (state machine, schemas, persistence) transfers directly.
- **Testing approach.** Unit tests remain the same. Integration tests need to
  account for the plugin API mock.

## References

- [OpenClaw Documentation](https://openclaw.dev/docs)
- [Roadmap](../roadmap_mvp.md)
- [EP01 -- OpenClaw Foundation](../backlog/EP01-openclaw-foundation.md)
