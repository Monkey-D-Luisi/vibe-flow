# Task: 0068 -- Fix Circuit Breaker Per-Agent Tracking

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP09 -- Pipeline Intelligence & Reliability |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-05 |
| Branch | `feat/0068-fix-circuit-breaker-agent-tracking` |

---

## Goal

Fix the decision engine circuit breaker to track decisions per-agent-per-task instead of using a hardcoded `'calling-agent'` string. This enables correct per-agent limiting in a multi-agent system and accurate audit trails.

---

## Context

The decision engine circuit breaker (EP08, Task 0044) was implemented with a hardcoded agent ID of `'calling-agent'` because the `ToolDef.execute` function signature does not include caller identity context. The `before_tool_call` hook system does have access to `ctx.agentId`, so the fix uses the same injection pattern as origin-injection.ts to pass the real agent ID into `decision_evaluate` params.

References:
- `extensions/product-team/src/tools/decision-engine.ts` lines 102, 117, 183
- `extensions/product-team/src/hooks/origin-injection.ts` (injection pattern)
- EP09 backlog, Lane C, Section 9C.1

---

## Scope

### In Scope

- Add optional `agentId` field to `DecisionEvaluateParams` schema
- Create `before_tool_call` hook to inject `agentId` from context into `decision_evaluate` params
- Update decision-engine.ts to use `input.agentId` instead of `'calling-agent'`
- Handle backwards compatibility: default to `'calling-agent'` when `agentId` is not provided
- Update tests to verify per-agent circuit breaker behavior
- Register the new hook in the plugin's `register()` function

### Out of Scope

- DB migration for existing `'calling-agent'` records (graceful handling only)
- Changes to ToolDef.execute signature (platform-level change)
- Decision outcome tracking (Task 0071)

---

## Requirements

1. The circuit breaker must count decisions per-agent-per-task, not globally per task
2. The `agent_decisions.agent_id` column must store the real agent ID
3. The `decision.log` tool must show the real agent ID in `decidedBy`
4. Existing records with `'calling-agent'` must not cause errors
5. When no agent context is available, fall back to `'calling-agent'`

---

## Acceptance Criteria

- [x] AC1: Circuit breaker counts decisions per `(task_ref, agent_id)` where `agent_id` is the real caller
- [x] AC2: `before_tool_call` hook injects `agentId` from `ctx.agentId` into `decision_evaluate` params
- [x] AC3: `decision.log` returns real agent ID in `decidedBy` for non-escalated decisions
- [x] AC4: Fallback to `'calling-agent'` when `ctx.agentId` is not available
- [x] AC5: All existing tests continue to pass (backwards compatibility)
- [x] AC6: New tests cover per-agent circuit breaker isolation

---

## Constraints

- No breaking changes to existing tool API
- Must use the before_tool_call hook pattern (not modify ToolDef.execute signature)
- agentId in schema must be optional for backwards compatibility

---

## Implementation Steps

1. Add optional `agentId` field to `DecisionEvaluateParams` schema
2. Create `agent-id-injection.ts` hook (follows origin-injection pattern)
3. Update `decision-engine.ts` to use `input.agentId ?? 'calling-agent'`
4. Register the hook in `index.ts`
5. Update existing tests and add new per-agent isolation tests
6. Run quality gates

---

## Testing Plan

- Unit tests: Hook correctly injects agentId, no-ops when not applicable
- Unit tests: Circuit breaker counts per-agent-per-task
- Unit tests: Two different agents can each make 5 decisions on the same task without triggering circuit breaker
- Integration tests: decision.log returns real agent IDs

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [x] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
