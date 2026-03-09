# Walkthrough: 0093 -- Routing Feedback Loop Integration

## Task Reference

- Task: `docs/tasks/0093-routing-feedback-loop-integration.md`
- Epic: EP12 -- Agent Learning Loop
- Branch: `feat/EP12-agent-learning-loop`
- PR: (pending)

---

## Summary

Integrated the performance scoring feedback loop into the model resolver, completing EP12's learning loop. The resolver now queries cross-extension scoring recommendations and can override default routing when a proven agent x model combination is available with sufficient confidence.

---

## Context

This is the capstone task of EP12 — it closes the loop between:
- Task 0089 (pattern detection) → Task 0090 (adaptive policy) → Task 0091 (performance scoring) → Task 0092 (template pre-loading) → **Task 0093 (routing feedback)**

The flow: `event_log` → `AgentModelScorer` → `scoring-integration` registry → `model-resolver` → routing decision.

## Key Decisions

1. **Step 3b insertion**: Scoring lookup happens between cost-aware tier adjustment (step 3) and timeout check (step 4), before the expensive fallback chain resolution.
2. **Override semantics**: When scoring override activates, it bypasses the fallback chain entirely and returns the scored model directly. This is safe because the override only triggers when the scored model's provider is not DOWN.
3. **Fail-open**: If `scoringFeedbackEnabled` is false, `taskType` is missing, or no recommendation exists, normal routing proceeds unaffected.
4. **Observability**: Both the scoring recommendation and override boolean are always attached to the result for downstream logging, even when override doesn't fire.
5. **DEGRADED tolerance**: Scored models on DEGRADED providers are still used (consistent with existing health check behavior — only DOWN is rejected).

## Resolver Flow (Updated)

```
1. Complexity scoring
2. Tier mapping
3. Cost-aware adjustment
3b. Scoring feedback lookup ← NEW
4. Timeout guard
5. Scoring override return (if active) ← NEW
6. Fallback chain resolution
7. Static fallback (if all else fails)
```

## Testing

- 14 new tests in `model-resolver.test.ts` covering:
  - Override activation with valid scoring recommendation
  - Disabled scoring config
  - Missing taskType
  - No recommendation for agent+taskType pair
  - Below-confidence threshold (with observability check)
  - Below-sample-size threshold
  - DOWN provider rejection
  - Unknown model in catalog
  - Custom threshold configuration
  - Observability of non-overriding recommendations
  - Structured log verification with `[OVERRIDE]` marker
  - DEGRADED provider tolerance
  - Unchecked provider tolerance (optimistic)
