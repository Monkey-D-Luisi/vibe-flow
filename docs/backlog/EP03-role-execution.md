# EP03 -- Role Execution

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| Epic        | EP03                                             |
| Status      | DONE                                             |
| Priority    | P1                                               |
| Phase       | 2 -- Role Execution                              |
| Target      | April 2026                                       |
| Depends on  | EP02                                             |
| Blocks      | EP05, EP06                                       |

## Goal

Contract-driven workflow execution where each role produces a validated JSON
output conforming to its schema. The step runner orchestrates role transitions
and enforces quality gates.

## Context

Each agent role has a defined input/output contract. When a task transitions
into a role's phase, the step runner invokes the corresponding agent, collects
its output, validates the JSON against the schema, and stores the result in
task metadata before advancing the state machine.

## Tasks

### 3.1 JSON schemas per role

Define TypeBox schemas for each role output:

| Role      | Schema Key          | Key Fields                                        |
|-----------|---------------------|---------------------------------------------------|
| PM        | `po_brief`          | title, acceptance_criteria, scope, done_if         |
| Architect | `architecture_plan` | modules, contracts, patterns, test_plan, adr_id    |
| Dev       | `dev_result`        | diff_summary, metrics, red_green_refactor_log      |
| QA        | `qa_report`         | total, passed, failed, skipped, evidence           |
| Reviewer  | `review_result`     | violations[], overall_verdict                      |

**Acceptance Criteria:**
- All five schemas defined and exported
- Schemas reject invalid payloads with clear messages

### 3.2 Step runner

- Implement a runner that executes role steps in sequence
- Support `llm-task` step type (delegates to agent via gateway)
- Support custom step types (shell commands, scripts)
- Collect and validate output against role schema

**Acceptance Criteria:**
- Runner executes steps in declared order
- Invalid outputs halt the pipeline with a validation error
- Successful outputs stored in task metadata

### 3.3 Quality gate integration and transition guards

- Hook quality checks into state transitions
- Define **field-level guards** per transition (ported from old TaskRecord rules):
  - `design -> in_progress`: requires `adr_id` (non-empty) and `contracts` (non-empty array)
  - `in_progress -> in_review`: coverage >= threshold, lint clean, `red_green_refactor_log` has >= 2 entries
  - `in_review -> qa`: no `high`-severity violations in review, `rounds_review` < max (configurable, default 3)
  - `qa -> done`: `failed == 0` in QA report
- Configurable thresholds per scope (major vs minor)

> **Design note (from deep-research report):** The old codebase enforced these
> guards in `TaskRecord.ts` transition validators. Keeping them as explicit
> per-transition rules prevents "operational hallucinations" where agents skip
> required evidence. The `rounds_review` counter lives in `orchestrator_state`.

**Acceptance Criteria:**
- Transitions blocked when gates fail
- Gate failures produce actionable error messages listing missing fields/thresholds
- Thresholds configurable in plugin config
- Field-level guards documented in a transition matrix

### 3.4 FastTrack system

- Minor-scope tasks skip architecture review
- Auto-transition from `grooming` directly to `in_progress`
- FastTrack flag recorded in event log

**Acceptance Criteria:**
- Minor tasks bypass `design` phase
- Major tasks always go through `design`
- FastTrack events visible in audit trail

## Out of Scope

- GitHub automation (EP04)
- Dashboard / observability (EP05)

## References

- [Roadmap](../roadmap.md)
- [EP02 -- Task Engine](EP02-task-engine.md)
