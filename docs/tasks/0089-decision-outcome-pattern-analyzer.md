# Task: 0089 -- Decision Outcome Pattern Analyzer

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP12 -- Agent Learning Loop |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-09 |
| Branch | `feat/EP12-agent-learning-loop` |

---

## Goal

Build a rule-based analysis engine that reads decision outcome history from the `agent_decisions` table and detects actionable patterns — enabling the system to learn from past decisions and recommend policy adjustments.

---

## Context

EP09 Task 0071 added decision outcome tracking: every auto-resolved decision is tagged with `success`, `overridden`, or `failed` based on task completion. This data is collected in the `agent_decisions.outcome` column but never analyzed. Task 0089 builds the first reader of this data — a pattern analyzer that detects when decisions should be escalated, auto-resolved, retried, or have their timeouts adjusted.

---

## Scope

### In Scope

- Decision pattern analyzer engine (`decision-pattern-analyzer.ts`)
- Four pattern types: `escalation_candidate`, `auto_candidate`, `failure_cluster`, `timeout_pattern`
- Read-only `decision_patterns` tool
- TypeBox schemas for pattern report
- Comprehensive tests with synthetic decision history

### Out of Scope

- Automatic policy adjustment (Task 0090)
- Model performance scoring (Task 0091)
- Template pre-loading (Task 0092)
- Routing integration (Task 0093)

---

## Requirements

1. Analyzer reads last N decisions from `agent_decisions` table (configurable, default 100)
2. Detects `escalation_candidate`: category X auto-resolved then overridden >= 3 times in last 10 decisions for that (category, agent) combo
3. Detects `auto_candidate`: category X always escalated but human always approves with same answer
4. Detects `failure_cluster`: agent Y's decisions fail >= 50% in stage Z
5. Detects `timeout_pattern`: decision category X consistently times out (via re-escalation evidence)
6. Confidence threshold >= 0.7 required before recommendation
7. Analysis is idempotent (re-analysis produces same results for same data)
8. New read-only tool `decision_patterns` registered and documented
9. >= 90% test coverage with synthetic decision history

---

## Acceptance Criteria

- [x] AC1: Analyzer processes configurable last N decisions (default 100)
- [x] AC2: All four pattern types detected with correct confidence scores
- [x] AC3: Patterns are idempotent (re-analysis of same data = same results)
- [x] AC4: New tool `decision_patterns` registered and returns PatternReport
- [x] AC5: >= 90% test coverage with synthetic decision history
- [x] AC6: Confidence threshold >= 0.7 enforced on all recommendations

---

## Constraints

- Read-only: analyzer must NOT modify the `agent_decisions` table
- Must use `ToolDeps` dependency injection pattern
- TypeBox schemas for all external contracts
- No `any` types

---

## Implementation Steps

1. Define TypeBox schemas for PatternReport, Pattern, Recommendation
2. Implement `DecisionPatternAnalyzer` class with `analyze()` method
3. Implement each pattern detector as a private method
4. Create `decision_patterns` tool definition
5. Register tool in `tools/index.ts`
6. Write comprehensive tests

---

## Testing Plan

- Unit tests: Pattern detection logic for each of the 4 pattern types
- Integration tests: Full analyzer with synthetic decision history in SQLite
- Edge cases: Empty history, all success, all failures, boundary thresholds
- Idempotency: Run analysis twice, verify identical results

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
