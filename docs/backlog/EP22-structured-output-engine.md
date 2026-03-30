# EP22 -- Structured Output Engine

> Epic Owner: Tech Lead
> Status: PLANNED
> Phase: V1-1 (first priority)
> Dependencies: None (builds on EP03 role execution and EP13 stable protocol)

## Problem Statement

Agents currently produce ad-hoc JSON outputs validated by loose schemas defined in
`extensions/product-team/src/workflow/schemas/`. Schema violations cause downstream
pipeline failures that are hard to diagnose. For example, when the PM agent produces
a roadmap output with an unexpected structure, the PO agent's refinement step fails
with cryptic validation errors.

MetaGPT's ActionNode system proves that typed, nested output trees with automatic
validation dramatically improve multi-agent reliability. Their approach: every action
has a typed output schema, outputs are validated before publishing, and violations
trigger automatic retries with structured error feedback to the LLM.

## Goal

Every agent role at every pipeline stage produces outputs conforming to a versioned,
validated schema. Schema violations trigger automatic retry with structured error
feedback. Output schemas are composable (subtask trees) and versioned for backwards
compatibility.

## Key Design Decisions

1. **Schema technology**: TypeBox (already used in the project) for runtime + compile-time safety
2. **Validation strategy**: Validate at stage completion, before pipeline advancement
3. **Retry mechanism**: On violation, feed the schema + error details back to the LLM with a correction prompt
4. **Versioning**: Semver for output schemas, backwards-compatible within same major version
5. **Migration path**: Phased — one role at a time, starting with PM (simplest outputs)

## Tasks

### V1-1A: Core Engine

#### Task 0150: Output Schema Registry and Validation Engine
**Scope**: Major
**Assignee**: Backend Dev

Build the core output schema registry that maps (role, stage) → TypeBox schema.
Integrate validation into the workflow step runner so every stage output is validated
before the pipeline can advance.

Acceptance criteria:
- Schema registry with register/lookup by (role, stage) tuple
- TypeBox schemas for all output types
- Validation runs automatically at stage completion
- Validation errors include human-readable path + expected vs actual
- Unit tests for registry CRUD and validation edge cases
- Zero regression in existing pipeline tests

#### Task 0151: Retry-on-Violation with Structured Error Feedback
**Scope**: Major
**Assignee**: Backend Dev

When validation fails, automatically retry the LLM call with structured error
feedback: the original prompt + schema + specific validation errors. Configurable
max retries (default 3). If retries exhausted, escalate to human via Telegram.

Acceptance criteria:
- Retry loop with configurable max retries
- Error feedback prompt includes: original prompt, schema definition, specific violations
- Retry token cost tracked and reported in observability
- Escalation to human after max retries exhausted
- Integration test: intentionally bad output → retry → corrected output
- Budget-aware: retries count against pipeline budget

### V1-1B: Composition & Versioning

#### Task 0152: Nested Output Composition for Subtask Trees
**Scope**: Major
**Assignee**: Tech Lead

Enable outputs to contain nested subtask structures. The tech lead's DECOMPOSITION
output should be a tree of subtasks, each with its own typed schema. This enables
the pipeline to handle complex tasks that decompose into parallel workstreams.

Acceptance criteria:
- Subtask tree schema type (parent → children with ordering)
- Recursive validation of nested outputs
- Subtask tree visualization in pipeline timeline
- Tech lead DECOMPOSITION stage uses subtask tree output
- Unit tests for tree construction, validation, and traversal

#### Task 0153: Output Versioning and Compatibility Layer
**Scope**: Minor
**Assignee**: Backend Dev

Add semver versioning to output schemas. When a consumer expects v1 but receives v2,
a compatibility layer transforms the output. Breaking changes require a major version
bump and migration script.

Acceptance criteria:
- Version field in every output schema
- Compatibility transform registry (v1 → v2 adapters)
- Schema diff tool: detect breaking vs non-breaking changes
- CI check: output schema changes must include version bump
- Documentation: schema change protocol for contributors

### V1-1C: Migration

#### Task 0154: Migrate All 8 Roles to Structured Output Contracts
**Scope**: Major
**Assignee**: Backend Dev + Tech Lead

Migrate all 8 agent roles across all pipeline stages to use the structured output
engine. Start with PM (simplest), end with QA (most complex outputs).

Migration order: PM → PO → Tech Lead → Designer → Backend Dev → Frontend Dev → QA → DevOps

Acceptance criteria:
- All 8 roles produce validated outputs at every stage they participate in
- Zero ad-hoc JSON parsing in workflow step runner
- Backwards compatibility: existing pipeline runs still work during migration
- Each role migration is a separate PR for safe rollout
- E2E pipeline test passes with all roles on structured outputs

## Definition of Done

- [ ] Output schema registry operational with TypeBox schemas for all roles
- [ ] Automatic validation at every pipeline stage transition
- [ ] Retry-on-violation with structured error feedback (>= 80% auto-recovery)
- [ ] Subtask tree outputs working for DECOMPOSITION stage
- [ ] Output versioning with backwards compatibility
- [ ] All 8 roles migrated to structured outputs
- [ ] E2E pipeline test (IDEA → DONE) passes with structured outputs
- [ ] Documentation: output schema authoring guide for contributors

## References

- [Roadmap V1](../roadmap_v1.md)
- [Roadmap MVP](../roadmap_mvp.md)
- [EP03 -- Role Execution](EP03-role-execution.md) (existing schema foundation)
- [EP13 -- Stable Agent Protocol](EP13-stable-agent-protocol.md) (message contracts)
