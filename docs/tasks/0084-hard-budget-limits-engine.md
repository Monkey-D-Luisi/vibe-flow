# Task: 0084 -- Hard Budget Limits Engine

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | [EP11 -- Budget Intelligence](../backlog/EP11-budget-intelligence.md) |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-08 |
| Branch | `feat/0084-hard-budget-limits-engine` |

---

## Goal

Replace advisory budget warnings with enforced hard limits that block LLM requests when budget is exhausted, using a hierarchical budget model (global → pipeline → stage → agent).

---

## Context

Budget tracking exists but is advisory-only. The event log captures token costs per stage (EP09 task 0072), and per-task budget limits were introduced in EP06, but they are soft warnings that do not halt execution. With limited LLM tokens, a pipeline that overruns its budget with no enforcement is a real operational risk.

---

## Scope

### In Scope

- Budget domain model with hierarchical scopes (global, pipeline, stage, agent)
- SQLite persistence layer with migration
- Budget status transitions (active → warning → exhausted)
- Enforcement logic that blocks LLM requests when budget exhausted
- Structured events emitted on status transitions

### Out of Scope

- Per-agent tracking (Task 0085)
- Model tier auto-downgrade integration (Task 0086)
- Telegram dashboard (Task 0087)
- Budget forecasting (Task 0088)

---

## Requirements

1. Budget records persist in SQLite with CRUD operations
2. Hierarchical budget scopes: global > pipeline > stage > agent
3. Hard limits block LLM requests when any scope is exhausted
4. Status transitions emit structured events to the event log
5. Budget consumption tracked via token recording function
6. Warning threshold triggers status change (default 80%)

---

## Acceptance Criteria

- [x] AC1: Budget table created via migration (no manual schema changes)
- [x] AC2: Hard limit enforcement blocks LLM requests when exhausted
- [x] AC3: Budget status transitions: active → warning → exhausted
- [x] AC4: Structured event emitted on every status transition
- [x] AC5: >= 90% test coverage

---

## Constraints

- Must use existing SQLite persistence patterns (see product-team migrations)
- No breaking changes to existing tool APIs
- Strict TypeScript: no `any` types
- ESM imports with `.js` extensions

---

## Implementation Steps

1. Create budget domain model (`domain/budget.ts`)
2. Create budget SQLite migration
3. Create budget persistence repository (`persistence/budget-repo.ts`)
4. Create budget enforcement guard (`orchestrator/budget-guard.ts`)
5. Write comprehensive tests for all modules
6. Integrate with existing event log for status transition events

---

## Testing Plan

- Unit tests: Domain model validation, status transitions, consumption recording
- Integration tests: SQLite persistence, migration execution, budget queries
- Contract tests: Event emission format, budget record schema validation

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 90%)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
