# Walkthrough: 0091 -- Agent-Model Performance Scorer

## Task Reference

- Task: `docs/tasks/0091-agent-model-performance-scorer.md`
- Epic: EP12 -- Agent Learning Loop
- Branch: `feat/EP12-agent-learning-loop`
- PR: (pending)

---

## Summary

Implemented an `AgentModelScorer` that computes composite performance scores for each agent x model pair from historical event log data. Scores are weighted across 4 dimensions (success rate, quality, token efficiency, duration efficiency) and published to a cross-extension `globalThis` registry for consumption by the model router.

---

## Context

The model router (EP10) routes LLM requests based on complexity and provider health. Task 0091 adds a learning signal: historical performance data from the product-team extension feeds back into routing decisions via a shared scoring registry.

## Key Decisions

1. **Cross-extension bridge**: Used `globalThis` + `Symbol.for('openclaw:scoring-state-registry')` pattern (same as budget-integration) for decoupled communication between product-team and model-router extensions.
2. **Composite scoring**: 4-dimension weighted score avoids over-indexing on any single metric.
3. **Confidence scaling**: `confidence = Math.min(sampleSize / 20, 1.0)` — requires 20+ samples for full confidence.
4. **Trend detection**: ±5 point threshold between latest and previous score to detect improving/degrading trends.

## Testing

- 18 unit tests for `AgentModelScorer` covering scoring math, trend detection, best-model selection, persistence, and edge cases
- 5 unit tests for `scoring-integration.ts` covering publish/get/list/clear operations
- FK constraint issue resolved by inserting prerequisite `task_records` in test setup
