# Transition Guard Evidence Reference

> This document tells agents exactly what metadata must be present in a
> `TaskRecord` for each state transition to succeed. Each guard is implemented
> in `extensions/product-team/src/orchestrator/transition-guards.ts`.

---

## Overview

Transition guards evaluate `task.metadata` fields before allowing a state
transition. If required evidence is missing or invalid, the guard returns
`TransitionGuardFailure[]` and the transition is blocked.

Guards are **only evaluated for guarded transitions**. Transitions without guards
(e.g., `backlog -> grooming`, `grooming -> design`) pass unconditionally.

---

## Guard Matrix

| Transition | Guard | Required metadata | Source |
|---|---|---|---|
| `design -> in_progress` | Architecture review | `architecture_plan` | Architect agent via `workflow.step.run` |
| `in_progress -> in_review` | Dev quality check | `dev_result` | Dev agent via `workflow.step.run` |
| `in_review -> qa` | Review cleanliness | `review_result` | Reviewer agent via `workflow.step.run` |
| `qa -> done` | QA pass | `qa_report` | QA agent via `workflow.step.run` |

---

## Detailed Evidence Requirements

### 1. `design -> in_progress`

**Required metadata key:** `task.metadata.architecture_plan`

```json
{
  "architecture_plan": {
    "adr_id": "ADR-001",
    "contracts": ["TaskRecord", "OrchestratorState"],
    "modules": ["domain", "persistence", "orchestrator"],
    "patterns": ["hexagonal", "event-sourcing"],
    "test_plan": "Unit + integration with in-memory SQLite"
  }
}
```

**Validation rules:**
- `architecture_plan` must be a non-null object
- `architecture_plan.adr_id` must be a non-empty string
- `architecture_plan.contracts` must be a non-empty array with at least one non-empty string

**How to set:** The architect agent runs `workflow.step.run` with an `llm-task`
step using `schemaKey: 'architecture_plan'`. The step runner validates the output
against `ArchitecturePlanSchema` (TypeBox) and stores it in `task.metadata`.

```typescript
// Example workflow.step.run call
{
  id: "<taskId>",
  agentId: "architect",
  rev: 1,
  steps: [{
    type: "llm-task",
    role: "architect",
    schemaKey: "architecture_plan",
    output: {
      modules: ["domain", "persistence"],
      contracts: ["TaskRecord"],
      patterns: ["hexagonal"],
      test_plan: "Unit tests with in-memory DB",
      adr_id: "ADR-002"
    }
  }],
  toStatus: "in_progress",
  orchestratorRev: 0
}
```

---

### 2. `in_progress -> in_review`

**Required metadata key:** `task.metadata.dev_result`

```json
{
  "dev_result": {
    "diff_summary": "Added task-create tool with TypeBox schema validation",
    "metrics": {
      "coverage": 85.5,
      "lint_clean": true
    },
    "red_green_refactor_log": [
      "RED: test for createTask with empty title",
      "GREEN: added title validation in createTaskRecord",
      "REFACTOR: extracted validation to separate function"
    ]
  }
}
```

**Validation rules:**
- `dev_result` must be a non-null object
- `dev_result.metrics` must be a non-null object
- `dev_result.metrics.coverage` must be a finite number >= threshold:
  - `major` scope: >= 80 (default)
  - `minor` scope: >= 70 (default)
  - `patch` scope: >= 70 (default)
  - Configurable via `pluginConfig.workflow.transitionGuards.coverage.{major,minor,patch}`
- `dev_result.metrics.lint_clean` must be exactly `true` (not truthy, not 1)
- `dev_result.red_green_refactor_log` must be an array with at least 2 entries

**How to set:** The dev agent runs `workflow.step.run` with an `llm-task` step
using `schemaKey: 'dev_result'`.

**Important:** After EP05, the `quality.coverage` and `quality.lint` tools
will write these values automatically into `task.metadata.dev_result.metrics`.

---

### 3. `in_review -> qa`

**Required metadata key:** `task.metadata.review_result`

```json
{
  "review_result": {
    "violations": [
      { "rule": "naming", "severity": "low", "message": "Consider renaming X" }
    ],
    "overall_verdict": "approved_with_suggestions"
  }
}
```

**Validation rules:**
- `review_result` must be a non-null object
- `review_result.violations` must be an array
- No violation may have `severity: "high"` or `severity: "critical"`
- Non-object entries in violations are treated conservatively as high severity
- Unknown/malformed severity values are treated conservatively as high severity
- Valid severity values: `"low"`, `"medium"`, `"high"`, `"critical"`
- `orchestratorState.roundsReview` must be < `maxReviewRounds` (default: 3)

**How to set:** The reviewer agent runs `workflow.step.run` with an `llm-task`
step using `schemaKey: 'review_result'`.

**Note on review rounds:** When the reviewer rejects (`in_review -> in_progress`),
`roundsReview` is incremented. After 3 rejections (default), the `in_review -> qa`
transition is also blocked. This prevents infinite review loops.

---

### 4. `qa -> done`

**Required metadata key:** `task.metadata.qa_report`

```json
{
  "qa_report": {
    "total": 42,
    "passed": 42,
    "failed": 0,
    "skipped": 0,
    "evidence": [
      "All unit tests pass",
      "Integration tests pass with in-memory DB"
    ]
  }
}
```

**Validation rules:**
- `qa_report` must be a non-null object
- `qa_report.failed` must be a finite number equal to exactly `0`

**How to set:** The QA agent runs `workflow.step.run` with an `llm-task` step
using `schemaKey: 'qa_report'`.

**After EP05:** The `quality.tests` tool will write `qa_report` automatically.

---

## Unguarded Transitions

The following transitions have NO guards (always pass):

| Transition | Notes |
|---|---|
| `backlog -> grooming` | Task picked up by PM |
| `grooming -> design` | Requirements ready |
| `grooming -> in_progress` | FastTrack: minor-scope tasks skip design |
| `in_review -> in_progress` | Rejection (increments `roundsReview`) |
| `qa -> in_progress` | QA failure sends back to dev |

---

## FastTrack Behavior

When a task has `scope: 'minor'` and transitions from `grooming`, the state
machine automatically redirects `grooming -> design` to `grooming -> in_progress`,
skipping the architecture review phase entirely.

This means **no `architecture_plan` is required for minor-scope tasks**.

---

## Configuration

Guard thresholds are configurable via `pluginConfig.workflow.transitionGuards`
in `openclaw.json` or the plugin config:

```json
{
  "workflow": {
    "transitionGuards": {
      "coverage": {
        "major": 80,
        "minor": 70,
        "patch": 70
      },
      "maxReviewRounds": 3
    }
  }
}
```

Defaults are defined in `DEFAULT_TRANSITION_GUARD_CONFIG` at
`src/orchestrator/transition-guards.ts:31-38`.

---

## Debugging Failed Guards

The `workflow.state.get` tool returns the full guard matrix and current config,
allowing an agent to understand exactly what evidence is missing:

```typescript
{
  task: { /* ... */ },
  orchestratorState: { /* ... */ },
  guardMatrix: [
    { transition: "design -> in_progress", requirements: ["architecture_plan.adr_id is non-empty", ...] },
    // ... all guards
  ],
  guardConfig: { coverageByScope: { major: 80, minor: 70, patch: 70 }, maxReviewRounds: 3 }
}
```
