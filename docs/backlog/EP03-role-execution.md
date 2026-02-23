# EP03 -- Role Execution

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| Epic        | EP03                                             |
| Status      | PENDING                                          |
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

### 3.3 Quality gate integration

- Hook quality checks into state transitions
- Before `in_progress -> in_review`: coverage >= threshold, lint clean
- Before `in_review -> qa`: reviewer approval
- Configurable thresholds per scope (major vs minor)

**Acceptance Criteria:**
- Transitions blocked when gates fail
- Gate failures produce actionable error messages
- Thresholds configurable in plugin config

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
