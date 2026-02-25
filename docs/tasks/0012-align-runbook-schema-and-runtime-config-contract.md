# Task: 0012 -- Align Runbook, Schema, and Runtime Config Contract

## Metadata

| Field | Value |
|-------|-------|
| Status | PENDING |
| Epic | Audit remediation |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-25 |
| Branch | feat/0012-align-runbook-schema-and-runtime-config-contract |
| Source Finding IDs | P-003 |

---

## Goal

Remove config-contract drift between documentation, plugin schema, and runtime behavior.

---

## Immutable Finding Snapshot (Do Not Edit)

| ID | Axis | Severity | Evidence | Impact | Recommendation |
|----|------|----------|----------|--------|----------------|
| P-003 | Product | MUST_FIX | Runbook documents workflow config keys not declared in product-team plugin manifest schema. | Configuration copied from docs can fail strict schema validation. | Keep docs, openclaw.plugin.json schema, and runtime config consumption in sync. |

---

## Scope

### In Scope

- Decide canonical ownership of workflow config keys.
- Update schema and runtime parser to match chosen contract.
- Update runbook examples and add schema contract validation tests.

### Out of Scope

- New workflow features beyond contract alignment.
- Changes to external OpenClaw core schemas.

---

## Requirements

1. Documented config examples validate against declared plugin schema.
2. Runtime does not consume undeclared config keys.
3. Contract tests protect against future drift.

---

## Acceptance Criteria

- [ ] AC1: Runbook config example validates against openclaw.plugin.json.
- [ ] AC2: Runtime reads only keys declared in schema or schema is updated to include runtime keys.
- [ ] AC3: Contract-validation tests are added and pass.
- [ ] AC4: Related docs are updated to reflect canonical contract.

---

## Implementation Steps

1. Define canonical workflow-config contract.
2. Implement schema/runtime/doc updates.
3. Add and execute contract tests.

---

## Testing Plan

- pnpm --filter @openclaw/plugin-product-team test
- pnpm --filter @openclaw/plugin-product-team lint
- pnpm --filter @openclaw/plugin-product-team typecheck

---

## Definition of Done

- [ ] Acceptance criteria validated with command-backed evidence
- [ ] Implementation completed with no scope drift
- [ ] Tests added or updated and passing
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated with execution journal and closure decision

---

## Agent References

- [Findings Processing Workflow](../../.agent/rules/findings-processing-workflow.md)
- [Source Audit](../audits/2026-02-25-comprehensive-audit-product-security-architecture-development.md)
