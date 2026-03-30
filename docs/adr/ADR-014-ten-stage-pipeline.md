# ADR-014: 10-Stage Pipeline over Simpler Workflow Models

## Status
Accepted

## Date
2026-03-12

## Context

The product-team extension orchestrates work from idea to delivery. The
question was how many stages the pipeline should have and how rigidly they
should be enforced.

Requirements:

- Mirror a real product team's workflow where different roles contribute at
  different phases.
- Provide clear handoff points with quality validation between stages.
- Support both simple tasks (minor bug fixes) and complex tasks (new features
  with design, implementation, review, and deployment).
- Enable metrics collection per stage (duration, cost, quality scores).

## Decision

Implement a **10-stage linear pipeline** with role assignments per stage:

| Stage | Owner | Purpose |
|-------|-------|---------|
| 1. IDEA | pm | Capture product idea, scope, success criteria |
| 2. ROADMAP | pm | Plan milestones, dependencies, priorities |
| 3. REFINEMENT | po | Refine requirements, user stories, acceptance criteria |
| 4. DECOMPOSITION | tech-lead | Technical breakdown, architecture decisions |
| 5. DESIGN | designer | UI/UX design, visual specifications |
| 6. IMPLEMENTATION | back-1/front-1 | Build code, write tests, pass quality gates |
| 7. QA | qa | Validation, test coverage, accessibility checks |
| 8. REVIEW | tech-lead | Code review, blocking violation detection |
| 9. SHIPPING | devops | Deploy, release, CI pipeline |
| 10. DONE | system | Pipeline completion, session cleanup |

**Special behavior:** If REVIEW finds blocking violations (and < 3 review
rounds have occurred), the pipeline loops back to IMPLEMENTATION for fixes.

## Alternatives Considered

### 3-stage pipeline (Plan → Build → Ship)

- **Pros:** Simple, low overhead, fast for small tasks.
- **Cons:** No role specialization — a single "Build" stage conflates
  implementation, testing, and review. No clear quality gate between
  coding and review. Cannot measure where time is spent.

### Kanban board (flexible columns)

- **Pros:** Maximum flexibility, stages can be added/removed per task.
- **Cons:** No enforced transitions — any agent could move a task to any
  column. No role-based ownership per stage. Quality gates between stages
  would need custom enforcement. Audit trail would not have clear
  stage boundaries.

### Event-driven choreography (no explicit stages)

- **Pros:** Agents react to events, producing emergent workflows.
- **Cons:** Hard to debug — "why is nothing happening?" has no clear answer.
  No stage-based metrics. Quality gates have no clear insertion points.
  The system needs predictable, observable progression, not emergent behavior.

### FastTrack short-circuit (fewer stages for minor tasks)

- **Pros:** Minor tasks skip unnecessary stages (design, decomposition).
- **Cons:** This was actually implemented as a complement: MINOR-scope tasks
  use a reduced pipeline. The 10-stage pipeline is the full model; FastTrack
  is a shortcut within it. This strengthens rather than replaces the decision.

## Consequences

### Positive

- Each stage has a clear owner, enabling role-based metrics and debugging.
- Quality gates between stages catch issues before they propagate downstream.
- The REVIEW → IMPLEMENTATION loop enables iterative improvement without
  human intervention.
- Per-stage metrics (duration, cost, token consumption) enable pipeline
  optimization over time.
- FastTrack for MINOR tasks avoids unnecessary ceremony.

### Negative

- 10 stages is heavyweight for trivial tasks. Even with FastTrack, the
  stage infrastructure has overhead.
- Linear progression doesn't model all workflows — some tasks benefit from
  parallel stages (e.g., design and decomposition simultaneously).
- Adding or removing stages requires migration of existing pipeline records.

### Neutral

- The 10-stage model maps naturally to established software delivery practices
  (agile ceremonies, CI/CD), making it intuitive for developers and PMs.

## References

- EP08 -- Autonomous Product Team (pipeline implementation)
- EP09 -- Pipeline Intelligence (stage metrics, auto-advancement)
- Task 0077 — First fully autonomous run through all 10 stages
- `extensions/product-team/src/tools/pipeline.ts` — pipeline tool implementation
