# Task: 0148 -- Multi-Bot Persona Identity

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP21 -- Agent Excellence & Telegram Command Center |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-03-21 |
| Branch | `feat/EP21-agent-excellence-telegram-command-center` |

---

## Goal

Give each agent a visual identity (emoji, display name, role, tagline) in
Telegram messages so team members know which agent is "speaking".

---

## Context

All Telegram notifications came from a single bot with no indication of which
agent produced them. Task transitions, errors, and pipeline advances all looked
identical. Agent personas make the chat feel like a real team with distinct
members.

---

## Scope

### In Scope

- `PersonaRegistry` class with 8 predefined agent personas + system
- `withPersona` helper to prefix messages with agent identity
- `resolveAgentId` to extract agent identity from events
- `getStagePersona` to map pipeline stages to owning agents
- Integration in `after_tool_call`, `agent_end`, and `subagent_spawned` hooks

### Out of Scope

- Custom persona configuration via plugin config
- Per-message bot switching (Telegram limitation)

---

## Requirements

1. Predefined personas for pm, tech-lead, po, designer, back-1, front-1, qa, devops
2. System persona as fallback for unknown agents
3. Messages prefixed with `emoji **DisplayName:** message`
4. Agent identity resolved from event context

---

## Acceptance Criteria

- [x] AC1: `PersonaRegistry` returns correct persona for all 8 agent IDs
- [x] AC2: `withPersona` prefixes messages with emoji and display name
- [x] AC3: `resolveAgentId` extracts agent ID from various event shapes
- [x] AC4: Lifecycle hooks use persona formatting for all notifications
- [x] AC5: `subagent_spawned` uses persona emoji instead of generic robot
- [x] AC6: Unit tests cover registry lookup, persona formatting, and agent resolution

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
