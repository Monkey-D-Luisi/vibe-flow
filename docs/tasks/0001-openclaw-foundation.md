# Task: 0001 -- OpenClaw Foundation

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP01 -- OpenClaw Foundation |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-23 |
| Branch | `feat/ep01-openclaw-foundation` |

---

## Goal

Set up the OpenClaw gateway with authentication, multi-agent routing by role,
and tool policies that restrict each agent to its authorized surface area.

---

## Context

The product-team system was migrated from a standalone MCP server to an OpenClaw
plugin (ADR-001). The current codebase has a placeholder `openclaw.json` and a
local subset of the `OpenClawPluginApi` interface. This task replaces the
placeholders with real OpenClaw configuration aligned with the actual plugin SDK
and gateway configuration schema.

---

## Scope

### In Scope

- Gateway configuration (`openclaw.json`) aligned with real OpenClaw schema
- Plugin setup with correct `plugins.load.paths` and `plugins.entries` config
- Agent definitions for all six roles (pm, architect, dev, qa, reviewer, infra)
- Per-agent tool allow-lists using OpenClaw's `agents.list[].tools.allow`
- Sandbox configuration using OpenClaw's `agents.defaults.sandbox`
- Replace local `OpenClawPluginApi` interface with types from `openclaw`
- Update tests to work with the new interface

### Out of Scope

- Tool implementation (EP02+)
- Workflow logic (EP03)
- CI/CD hooks (EP04)
- Production hardening (EP06)

---

## Requirements

1. `openclaw.json` must use OpenClaw's real configuration schema
2. All six agents must be defined with correct tool allow-lists
3. Plugin must import types from the `openclaw` package instead of local subset
4. Each agent must have a workspace path for isolation
5. Sandbox mode must be configured for non-main agents
6. All existing tests must continue to pass

---

## Acceptance Criteria

- [x] AC1: `openclaw.json` uses valid OpenClaw schema (plugins, agents, skills, tools)
- [x] AC2: All six agents defined in `agents.list` with id, name, workspace
- [x] AC3: Per-agent tool allow-lists configured correctly
- [x] AC4: Plugin uses real `OpenClawPluginApi` from `openclaw` package
- [x] AC5: Sandbox configured with `mode: "non-main"` for agent isolation
- [x] AC6: Skills directories referenced correctly
- [x] AC7: All tests pass, lint clean, types clean

---

## Constraints

- Must use OpenClaw's actual configuration schema (not invented fields)
- No breaking changes to existing plugin export shape
- Must maintain compatibility with existing test structure

---

## Implementation Steps

1. Install `openclaw` as a dependency in `extensions/product-team`
2. Update `openclaw.json` to align with real OpenClaw schema
3. Replace local `OpenClawPluginApi` interface with import from `openclaw`
4. Add per-agent workspace paths and sandbox configuration
5. Update tests to work with new types
6. Verify all quality gates pass

---

## Testing Plan

- Unit tests: Plugin registration with mock API matching real types
- Contract tests: `openclaw.json` schema validation

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 80% major / >= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [ ] PR created and linked
