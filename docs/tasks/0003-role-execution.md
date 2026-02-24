# Task: 0003 -- Role Execution

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP03 -- Role Execution |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-24 |
| Branch | `feat/0003-role-execution` |

---

## Goal

Implement contract-driven role execution for the product-team plugin so each role output is schema-validated, workflow steps run in order, and state transitions are guarded by required evidence and thresholds.

---

## Context

EP02 delivered the task lifecycle engine, persistence, leases, and transition mechanics. EP03 adds workflow behavior on top of that foundation: role output contracts, step orchestration, field-level transition guards, and FastTrack handling for minor-scope tasks.

---

## Scope

### In Scope

- TypeBox role schemas for PM, Architect, Dev, QA, and Reviewer outputs
- Workflow step runner with ordered execution and schema validation
- Transition guard enforcement with configurable thresholds
- FastTrack behavior for minor tasks and audit events
- Tool registration for workflow step execution/state visibility

### Out of Scope

- GitHub automation tools (EP04)
- Quality extension migration and dashboards (EP05)
- Security and production hardening (EP06)

---

## Requirements

1. Define and export role output schemas keyed as `po_brief`, `architecture_plan`, `dev_result`, `qa_report`, and `review_result`.
2. Implement a step runner that executes declared steps in order and halts on validation failures.
3. Persist successful step outputs to task metadata under stable contract keys.
4. Enforce transition guards for:
   - `design -> in_progress`
   - `in_progress -> in_review`
   - `in_review -> qa`
   - `qa -> done`
5. Make thresholds configurable per scope (`major` and `minor`) through plugin config.
6. Support FastTrack for minor tasks by skipping design and recording a dedicated event.
7. Register workflow tools and verify they return structured JSON details.

---

## Acceptance Criteria

- [x] AC1: All five role output schemas are implemented and exported.
- [x] AC2: Invalid role payloads are rejected with clear validation errors.
- [x] AC3: Step runner executes steps in order and stops on the first invalid output.
- [x] AC4: Successful role outputs are written to task metadata using schema keys.
- [x] AC5: Transition guards block invalid transitions with actionable error messages.
- [x] AC6: Guard thresholds are configurable and applied by task scope.
- [x] AC7: Transition guard matrix is documented in code and exposed by workflow state tooling.
- [x] AC8: Minor tasks bypass design via FastTrack and emit an audit event.
- [x] AC9: Workflow tools are registered and covered by tests.

---

## Constraints

- Maintain strict TypeScript and avoid `any`.
- Keep existing EP02 task tools backward-compatible.
- Use TypeBox schemas and shared validator path for runtime validation.

---

## Implementation Steps

1. Add EP03 schema modules and shared role contract mapping.
2. Implement transition guard evaluator with scope-based thresholds.
3. Update state-machine transition flow for guard checks and FastTrack behavior.
4. Implement workflow step runner service and workflow tools.
5. Register workflow tools in plugin entry point.
6. Add tests for schemas, guards, runner, FastTrack, and tool registration.

---

## Testing Plan

- Unit tests: Role schema validation and transition guard evaluation.
- Integration tests: State-machine transitions with guard/pass/fail paths.
- Tool tests: Workflow step runner and workflow state retrieval tools.

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [ ] Coverage meets threshold (>= 80% major)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [x] PR created and linked (#163)
