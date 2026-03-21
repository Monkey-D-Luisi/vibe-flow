# Task: 0105 -- /health Real-Time Diagnostics

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP15 -- Telegram Control Plane v2 |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-21 |
| Branch | `feat/EP15-telegram-control-plane-v2` |

---

## Goal

Replace /health stub with system health dashboard showing gateway status, pipelines, agents, budget, tokens, stage distribution.

---

## Context

The /health command currently returns a placeholder response. EP15 requires functional diagnostics that surface real system health data. This command provides operators with a single-glance overview of the entire OpenClaw system state.

---

## Scope

### In Scope

- health-diagnostics.ts command module
- DataSource abstraction
- Multi-section dashboard (gateway, pipelines, agents, budget, tokens, stages)

### Out of Scope

- Historical health data
- Uptime tracking

---

## Requirements

1. Gateway status indicator
2. Active pipeline count
3. Agent activity ratio
4. Budget usage
5. Stage distribution breakdown

---

## Acceptance Criteria

- [x] AC1: /health renders multi-section dashboard
- [x] AC2: Shows budget percentage
- [x] AC3: 9 tests pass

---

## Constraints

- Must follow DataSource injection pattern for testability
- No breaking changes to existing Telegram bot registration

---

## Implementation Steps

1. Create DataSource interface for health metrics retrieval
2. Implement health-diagnostics.ts with multi-section rendering
3. Add gateway status, pipeline count, agent ratio, budget, tokens, stage distribution sections
4. Register command in index.ts
5. Write 9 unit tests with mock DataSource

---

## Testing Plan

- Unit tests: 9 tests covering each dashboard section, edge cases, and error handling
- Integration tests: N/A (DataSource abstraction decouples from real data)
- Contract tests: N/A

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] Code reviewed (if applicable)
- [x] PR created and linked

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/telegram-notifier/src/commands/health-diagnostics.ts` | Created | Health diagnostics command with multi-section dashboard |
| `extensions/telegram-notifier/test/commands/health-diagnostics.test.ts` | Created | 9 unit tests for health diagnostics |
| `extensions/telegram-notifier/src/index.ts` | Modified | Register /health command |

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
