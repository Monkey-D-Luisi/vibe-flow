# Task: 0104 -- /teamstatus Live Agent Dashboard

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

Replace /teamstatus stub with live agent dashboard showing all 8 agents with status, task, pipeline stage, and last activity.

---

## Context

The /teamstatus command currently returns a placeholder response. EP15 replaces all Telegram stubs with functional dashboards backed by real data sources. This task implements the first live command: an 8-agent overview table with budget footer.

---

## Scope

### In Scope

- team-status.ts command module
- DataSource abstraction
- 8-agent table rendering
- Budget footer

### Out of Scope

- Real-time push
- Interactive buttons

---

## Requirements

1. Shows all 8 agents
2. Active/idle indicator
3. Current task + stage when applicable
4. Budget percentage footer
5. DataSource injection for testability

---

## Acceptance Criteria

- [x] AC1: /teamstatus renders 8-agent table
- [x] AC2: Shows ON/off indicators
- [x] AC3: Budget footer
- [x] AC4: 8 tests pass

---

## Constraints

- Must follow DataSource injection pattern established in budget-dashboard.ts
- No breaking changes to existing Telegram bot registration

---

## Implementation Steps

1. Create DataSource interface for agent status retrieval
2. Implement team-status.ts command module with table rendering
3. Add budget footer section
4. Register command in index.ts
5. Write 8 unit tests with mock DataSource

---

## Testing Plan

- Unit tests: 8 tests covering agent rendering, ON/off indicators, budget footer, edge cases
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
| `extensions/telegram-notifier/src/commands/team-status.ts` | Created | Team status command module with DataSource pattern |
| `extensions/telegram-notifier/test/commands/team-status.test.ts` | Created | 8 unit tests for team status rendering |
| `extensions/telegram-notifier/src/index.ts` | Modified | Register /teamstatus command |

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
