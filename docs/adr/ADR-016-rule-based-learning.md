# ADR-016: Rule-Based Learning over ML-Based Learning

## Status
Accepted

## Date
2026-03-20

## Context

The decision engine (EP08/EP09) logs the outcome of every decision: success,
overridden (human changed the auto-decision), or failed (the auto-decision
led to a bad result). EP12 asked: how should the system use this data to
improve future decisions?

The data characteristics are:

- **Low volume:** Hundreds of decisions per week, not millions.
- **Structured:** Each decision has a clear type, context (agent, stage,
  scope), and outcome.
- **Categorical:** Most decision factors are categorical (agent role, task
  scope, model tier), not continuous.
- **Interpretable required:** Operators need to understand why a decision
  was made differently than before.

## Decision

Use **rule-based pattern detection** over structured event data, not
ML-based learning.

Design:

1. **Decision outcome pattern analyzer:** Scans decision history for
   patterns — e.g., "model X fails 80% on QA tasks" or "auto-approve
   for pm is overridden 60% of the time."
2. **Adaptive escalation policies:** When override rate exceeds a threshold,
   automatically tighten the policy (auto → escalate). When success rate
   is consistently high, relax it (escalate → auto).
3. **Agent-model performance scorer:** Tracks success rates per
   (agent, model, task-type) triple. Used by the model router (EP10) to
   prefer models that historically succeed for a given agent and task type.
4. **Dynamic template pre-loading:** Caches output templates from
   historically successful runs for reuse.
5. **Routing feedback integration:** Success/failure signals are fed back
   to the model router's scoring function.

All rules are transparent: an operator can read the decision log and understand
exactly why a policy changed.

## Alternatives Considered

### ML-based learning (fine-tuning, reinforcement learning)

- **Pros:** Could discover non-obvious patterns, improves with more data.
- **Cons:** Requires training data volumes orders of magnitude larger than
  available. Model training and evaluation infrastructure (GPU, experiment
  tracking, model serving) violates the local-first constraint. Results
  are opaque — operators cannot explain why a decision changed. Massive
  over-engineering for the current scale.

### No learning (static policies)

- **Pros:** Simplest, most predictable behavior. Operators configure policies
  once and they never change.
- **Cons:** Ignores valuable data. The same mistakes are repeated. Operators
  must manually monitor and tune policies. The system accumulates decision
  history but never uses it.

### Bayesian / probabilistic models

- **Pros:** Handles uncertainty well, works with small datasets.
- **Cons:** Still requires a statistical modeling layer, prior selection,
  and model evaluation. More complex to implement and explain than simple
  threshold-based rules. The current decision types are simple enough that
  threshold detection is sufficient.

## Consequences

### Positive

- Transparent: every policy change can be traced to specific decision
  outcomes that triggered it.
- No infrastructure requirements: runs in-process with SQLite queries.
- Low data requirements: useful patterns emerge from tens of decisions,
  not thousands.
- Interpretable: operators can read the rules and override them.

### Negative

- Limited to patterns humans could also detect — no non-obvious insights.
- Threshold tuning is manual: what override rate triggers a policy change?
  Currently set at 60% over last 10 decisions, but this is a heuristic.
- Cannot handle complex multi-variable interactions that ML could detect
  (if sufficient data existed).

### Neutral

- The rule-based approach can be replaced with ML in the future if data
  volume grows sufficiently. The decision log format supports both approaches.

## References

- EP09 -- Pipeline Intelligence (decision outcome tracking)
- EP10 -- Dynamic Model Routing (routing override integration)
- EP11 -- Budget Intelligence (budget-aware decision adjustments)
- EP12 -- Agent Learning Loop (pattern analyzer and adaptive policies)
- `extensions/product-team/src/` — learning loop implementation
