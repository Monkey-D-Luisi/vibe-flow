# Walkthrough 0044 -- Autonomous Decision Engine

## Summary

Built the autonomous decision engine that enables agents to make consistent,
auditable choices when facing ambiguity without blocking the pipeline. Two new
tools (`decision.evaluate`, `decision.log`) expose the engine. The
`decision.evaluate` tool accepts a category, question, options, and an optional
recommendation, then applies a configurable policy (auto, escalate, pause,
retry) to determine whether the agent decides autonomously or escalates. All
decisions are persisted in an `agent_decisions` SQLite table for a full audit
trail. A circuit breaker prevents infinite decision loops by enforcing a
limit of 5 decisions per agent per task before mandatory escalation to
`tech-lead`.

## Decisions

Policy resolution order: `decisionConfig.policies[category]` > `DEFAULT_POLICIES[category]` >
`DEFAULT_POLICIES['technical']` (auto fallback). This matches the task spec while
being configurable at runtime without code changes.

The default policies are:
- `technical` → auto (agent decides autonomously)
- `scope` → escalate → tech-lead
- `quality` → escalate → tech-lead
- `conflict` → escalate → po
- `budget` → pause → human
- `blocker` → retry (uses recommendation as decision)

## Changes

- `extensions/product-team/src/tools/decision-engine.ts` (new): Two tool factory
  functions — `decisionEvaluateToolDef` and `decisionLogToolDef`. Lazy table
  creation via `ensureDecisionsTable()`. Circuit breaker queries the
  `agent_decisions` table before processing to enforce the 5-decision limit.
- `extensions/product-team/src/schemas/decision.schema.ts` (new): TypeBox schemas
  `DecisionEvaluateParams` and `DecisionLogParams`.
- `extensions/product-team/src/tools/index.ts`: Added imports and registrations
  for `decisionEvaluateToolDef` and `decisionLogToolDef` in `getAllToolDefs`.
- `extensions/product-team/src/index.ts`: Added `decisionConfig` resolution from
  `pluginConfig.decisions` (policies, timeoutMs, humanApprovalTimeout) and wired
  it into deps for `decision.evaluate`.
- `extensions/product-team/test/tools/decision-engine.test.ts` (new): 15 tests
  covering auto-decision, escalation for all relevant categories, circuit breaker
  triggering, custom policy override, and `decision.log` audit trail.

## Verification

- typecheck: PASS
- lint: PASS
- tests: PASS (479 total, 15 new)
