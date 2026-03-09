# Task: 0091 -- Agent-Model Performance Scorer

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

Compute composite performance scores for each agent x model combination, using historical event log data. Scores feed into the model router to bias routing toward proven performers.

---

## Acceptance Criteria

1. `AgentModelScorer` class queries `event_log` for `cost.llm` events
2. Composite score from 4 weighted dimensions: successRate (40%), qualityScore (25%), tokenEfficiency (20%), durationEfficiency (15%)
3. Trend detection: improving / stable / degrading (±5 point threshold)
4. `getBestModel()` returns recommendation with confidence scaling by sample size
5. Scores persisted in `agent_model_scores` SQLite table
6. Cross-extension integration via `globalThis` + `Symbol.for()` registry pattern

---

## Files Changed

- `extensions/product-team/src/orchestrator/agent-model-scorer.ts` (new)
- `extensions/product-team/test/orchestrator/agent-model-scorer.test.ts` (new)
- `extensions/model-router/src/scoring-integration.ts` (new)
- `extensions/model-router/test/scoring-integration.test.ts` (new)
