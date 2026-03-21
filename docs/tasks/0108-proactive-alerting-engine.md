# Task: 0108 -- Proactive Alerting Engine

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

Add a background polling service that detects alert conditions (budget warnings, pipeline stalls, system health issues, agent inactivity) and enqueues Telegram notifications.

---

## Context

The team had no proactive alerting — all notifications were reactive (triggered by tool calls). This task adds background polling to detect conditions that require human attention.

---

## Scope

### In Scope

- AlertEngine class with start/stop/poll
- 4 alert rule functions (checkBudgetWarning, checkPipelineStalled, checkSystemHealth, checkAgentInactivity)
- AlertCooldown deduplication
- Config-driven enable/disable
- Service registration in index.ts

### Out of Scope

- Webhook-based alerting
- SMS/email channels
- Alert acknowledgment

---

## Requirements

1. Background polling at configurable interval
2. Budget warning at 80% (WARNING) and 95% (CRITICAL)
3. Pipeline stall detection at 15-minute threshold
4. System health degradation/down detection
5. Agent inactivity when pipelines active
6. Cooldown deduplication
7. Graceful error handling on API failures

---

## Acceptance Criteria

- [x] AC1: AlertEngine starts/stops cleanly
- [x] AC2: Budget alerts fire at correct thresholds
- [x] AC3: Pipeline stall detected
- [x] AC4: Cooldown prevents duplicate alerts
- [x] AC5: API errors handled gracefully
- [x] AC6: 27 tests pass across 3 test files

---

## Constraints

- Config-driven (alerting.enabled)
- No new dependencies

---

## Implementation Steps

1. Create alert-cooldown.ts
2. Create alert-rules.ts with 4 rule functions
3. Create alert-engine.ts with polling logic
4. Register service in index.ts

---

## Testing Plan

- Unit tests: AlertCooldown (6 tests), alert rules (15 tests), AlertEngine (6 tests)

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing (27 tests)
- [x] Coverage meets threshold (>= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] Code reviewed (if applicable)
- [x] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
