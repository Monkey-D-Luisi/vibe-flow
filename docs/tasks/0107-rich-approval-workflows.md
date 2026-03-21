# Task: 0107 -- Rich Approval Workflows

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP15 -- Telegram Control Plane v2 |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-03-21 |
| Branch | `feat/EP15-telegram-control-plane-v2` |

---

## Goal

Enrich /decisions display with budget context, individual decision detail rendering, and graceful degradation when metrics unavailable.

---

## Context

The /decisions command exists but lacks budget context and detailed rendering. EP15 enriches Telegram commands with actionable data. This task adds budget awareness to decision views and handles metrics unavailability gracefully.

---

## Scope

### In Scope

- decision-context.ts command module
- DecisionContextDataSource abstraction
- Budget context enrichment
- Inline approve/reject commands

### Out of Scope

- Telegram inline buttons
- Decision history

---

## Requirements

1. Show decision details with category, question, approve/reject commands
2. Budget context when metrics available
3. Graceful degradation on metrics failure
4. Error handling for decisions API failure

---

## Acceptance Criteria

- [x] AC1: /decisions shows enriched view
- [x] AC2: Budget context included
- [x] AC3: Graceful degradation works
- [x] AC4: 8 tests pass

---

## Constraints

- Must follow DataSource injection pattern for testability
- Graceful degradation must not break rendering when metrics API is unavailable
- No breaking changes to existing Telegram bot registration

---

## Implementation Steps

1. Create DecisionContextDataSource interface
2. Implement decision-context.ts with enriched rendering
3. Add budget context section with metrics integration
4. Implement graceful degradation for metrics failures
5. Add inline approve/reject command hints
6. Register command in index.ts
7. Write 8 unit tests with mock DataSource

---

## Testing Plan

- Unit tests: 8 tests covering enriched rendering, budget context, graceful degradation, error handling, edge cases
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
| `extensions/telegram-notifier/src/commands/decision-context.ts` | Created | Decision context command with budget enrichment |
| `extensions/telegram-notifier/test/commands/decision-context.test.ts` | Created | 8 unit tests for decision context |
| `extensions/telegram-notifier/src/index.ts` | Modified | Register /decisions command |

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
