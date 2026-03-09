# Task: 0085 -- Per-Agent Budget Tracking and Enforcement

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP11 -- Budget Intelligence |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-09 |
| Branch | `feat/0085-per-agent-budget-tracking` |

---

## Goal

Track token consumption per agent per pipeline run and enforce per-agent budget allocations, converting the standalone budget infrastructure (Task 0084) into an active enforcement layer wired into the plugin lifecycle.

---

## Context

Task 0084 built the hard budget limits engine: domain model, SQLite persistence, optimistic concurrency, and a budget guard with check/enforce/record functions. However, the infrastructure is **not wired** into the plugin lifecycle -- `SqliteBudgetRepository` is not instantiated in `index.ts`, and no `after_tool_call` hook records consumption. This task bridges that gap for the agent scope specifically, creating the pricing table, agent budget tracker, and lifecycle hooks.

---

## Scope

### In Scope

- Pricing table with configurable model-to-cost mapping
- Agent budget tracker that records per-agent token consumption
- `after_tool_call` hook in `index.ts` for consumption recording
- Default budget allocation percentages per agent role
- Budget enforcement for agent-scope budgets via existing `enforceBudget`

### Out of Scope

- Telegram `/budget` dashboard (Task 0087)
- Budget-triggered model tier auto-downgrade (Task 0086)
- Budget forecasting (Task 0088)
- `before_model_resolve` hook integration (Task 0086)

---

## Requirements

1. Token consumption tracked per agent per pipeline run
2. USD cost calculated using configurable provider pricing table
3. Agent budget enforcement blocks agent LLM calls when exhausted
4. Budget allocation percentages configurable in plugin config
5. >= 90% test coverage

---

## Acceptance Criteria

- [x] AC1: Pricing table maps model names to input/output per-1K-token USD rates
- [x] AC2: Agent budget tracker records consumption via `after_tool_call` hook
- [x] AC3: `SqliteBudgetRepository` instantiated and wired in `index.ts`
- [x] AC4: Agent budget enforcement blocks calls when agent budget exhausted
- [x] AC5: Default allocation percentages configurable per agent
- [x] AC6: >= 90% test coverage for all new files

---

## Constraints

- Must use existing `BudgetRecord`, `SqliteBudgetRepository`, and `budget-guard` from Task 0084
- No breaking changes to existing tool API
- `index.ts` must stay under 500 LOC

---

## Implementation Steps

1. Create `extensions/product-team/src/domain/pricing-table.ts` with model pricing data
2. Create `extensions/product-team/src/orchestrator/agent-budget-tracker.ts` with tracking logic
3. Modify `extensions/product-team/src/index.ts` to instantiate budget repo and wire hooks
4. Write tests for pricing table and agent budget tracker
5. Run quality gates

---

## Testing Plan

- Unit tests: pricing table lookups, cost calculation, default allocation
- Unit tests: agent budget tracker consumption recording, enforcement
- Integration tests: `after_tool_call` hook records consumption to budget table

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 90%)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
