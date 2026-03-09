# Task: 0088 -- Budget Forecasting and Overspend Alerting

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP11 -- Budget Intelligence |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-03-09 |
| Branch | `feat/0088-budget-forecasting-alerting` |

---

## Goal

Add predictive budget forecasting that alerts when the current consumption rate
will exhaust the budget before pipeline completion, and send proactive Telegram
notifications on budget threshold crossings.

---

## Context

Tasks 0084-0087 built the budget engine with hard limits, per-agent tracking,
model tier auto-downgrade, and a Telegram dashboard. Budget status transitions
are already emitted via the event log. However, there is no forward-looking
analysis — the system reacts to exhaustion but doesn't predict it. Task 0088
closes this gap by adding forecasting and proactive alerting.

---

## Scope

### In Scope

- Budget forecasting engine (burn rate + remaining work estimation)
- Proactive Telegram alerts on budget transitions
- Alert types: WARNING, FORECAST_OVERSPEND, EXHAUSTED, REPLENISHED
- Forecast recalculation after each stage completion

### Out of Scope

- ML-based forecasting (rule-based only)
- Historical cross-pipeline analysis
- UI dashboard for forecasting

---

## Requirements

1. Calculate burn rate from consumed tokens / elapsed pipeline time
2. Estimate remaining work from remaining stages × avg tokens per completed stage
3. Forecast whether remaining budget covers estimated remaining work
4. Generate actionable alerts with model tier downgrade recommendations
5. Send alerts to Telegram via the existing message queue
6. No false positives: only alert when confidence >= 80%

---

## Acceptance Criteria

- [x] AC1: Forecast recalculated after each stage completion
- [x] AC2: Alert includes actionable recommendation (e.g., "downgrade to Economy tier")
- [x] AC3: No false-positive alerts (only alert if confident >= 80% of overspend)
- [x] AC4: >= 90% test coverage including edge cases (first stage, single-stage pipeline)

---

## Constraints

- Must integrate with existing budget domain model and event log
- Must use the existing Telegram message queue (enqueue function pattern)
- No external dependencies

---

## Implementation Steps

1. Create `budget-forecast.ts` in product-team orchestrator
2. Create `budget-alerts.ts` in telegram-notifier handlers
3. Wire forecast into pipeline-advance stage completion flow
4. Write comprehensive tests for both modules
5. Run quality checks

---

## Testing Plan

- Unit tests: Forecasting algorithm, burn rate, confidence thresholds
- Unit tests: Alert formatting, Telegram message generation
- Edge cases: First stage, single-stage pipeline, zero consumption, no budget configured

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
