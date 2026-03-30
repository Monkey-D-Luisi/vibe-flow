# ADR-013: Decision Engine with Auto/Escalate/Pause Policies

## Status
Accepted

## Date
2026-03-12

## Context

The autonomous product team makes many decisions during pipeline execution:
which model to use, whether to retry a failed stage, whether to reassign
a task to a different agent, how to handle quality gate failures. In early
iterations, all decisions were hardcoded — every quality gate failure
immediately escalated to a human.

Problems:

- **Over-escalation:** Humans were asked to decide trivial matters (e.g.,
  "retry a transient Telegram timeout"), interrupting workflow.
- **No learning:** Repeated decisions about the same scenario were escalated
  every time, even when the human always chose the same option.
- **No pause capability:** Some decisions (e.g., budget overrun) require
  halting the pipeline until a human reviews, not just notifying.

## Decision

Implement a **decision engine** with three policy types: auto, escalate, and
pause.

Design:

1. **Auto-decide:** Low-impact decisions are resolved automatically based on
   configurable rules. Examples: retry on transient failure, downgrade model
   tier on budget threshold.
2. **Escalate:** Medium-impact decisions are forwarded to the appropriate
   agent or human via Telegram. The pipeline continues while awaiting a
   response. Examples: task reassignment, non-standard quality gate override.
3. **Pause:** High-impact decisions halt the pipeline until explicitly
   approved. Examples: budget overrun, security gate failures, production
   deployment approval.
4. **Per-agent circuit breaker:** Tracks consecutive failures per agent.
   After `maxRetries` failures, auto-escalates to the PM for reassignment.
5. **Timeout enforcement:** Decisions that remain unresolved past their
   timeout are auto-resolved with the default action.
6. **Outcome tracking:** Every decision is logged with its outcome
   (success/overridden/failed) for the learning loop (EP12).

## Alternatives Considered

### Always escalate to human

- **Pros:** Maximum control, no risk of bad auto-decisions.
- **Cons:** Defeats the purpose of an autonomous team. With 8 agents and
  10 pipeline stages, dozens of decisions per pipeline run would overwhelm
  a human operator. Pipeline velocity drops to human response time.

### Fully autonomous (never escalate)

- **Pros:** Maximum speed, no human bottleneck.
- **Cons:** High-impact errors (budget overrun, security failures) need
  human judgment. A fully autonomous system with no safety valve would
  eventually make an expensive mistake.

### Rule engine (Drools / json-rules-engine)

- **Pros:** Declarative rules, easy to modify without code changes.
- **Cons:** External dependency, complex setup for what is currently ~20
  decision rules. The built-in policy system is simpler and sufficient.
  Can be replaced with a rule engine if the number of rules grows significantly.

## Consequences

### Positive

- Balanced autonomy: routine decisions are automatic, critical ones involve
  humans.
- Circuit breaker prevents cascading failures from a consistently failing agent.
- Outcome tracking enables the learning loop (EP12) to improve future decisions.
- Pause policy provides a hard stop for scenarios that require human judgment.

### Negative

- Policy configuration requires understanding the decision types and their
  impact levels. Misconfigured policies can lead to either over-escalation
  or under-escalation.
- Auto-decided outcomes may occasionally be wrong, requiring the override
  tracking (EP12) to detect and correct patterns.

### Neutral

- The three-tier policy model (auto/escalate/pause) is a common pattern in
  workflow automation systems, making it familiar to operations engineers.

## References

- EP08 -- Autonomous Product Team (decision engine implementation)
- EP09 -- Pipeline Intelligence (circuit breaker, timeout enforcement)
- EP12 -- Agent Learning Loop (outcome tracking and adaptive policies)
- `extensions/product-team/src/` — decision engine implementation
