# Task: 0010 -- Restore Root Quality-Gate Command Surface

## Metadata

| Field | Value |
|-------|-------|
| Status | PENDING |
| Epic | Audit remediation |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-02-25 |
| Branch | feat/0010-restore-root-quality-gate-command-surface |
| Source Finding IDs | P-001 |

---

## Goal

Restore a valid and consistent root-level command contract for quality-gate operations.

---

## Immutable Finding Snapshot (Do Not Edit)

| ID | Axis | Severity | Evidence | Impact | Recommendation |
|----|------|----------|----------|--------|----------------|
| P-001 | Product | MUST_FIX | Root package.json lacks q:* scripts and pnpm q:gate fails. | Documented command interface is not executable from repository root. | Add root q:* scripts delegating to @openclaw/quality-gate or update docs to workspace-filtered commands. |

---

## Scope

### In Scope

- Define and implement root scripts for q:gate/q:tests/q:coverage/q:lint/q:complexity.
- Align governance and operational docs with executable command surface.
- Add command contract regression checks.

### Out of Scope

- Changing quality-gate tool internals.
- Altering CI vulnerability policy.

---

## Requirements

1. Root commands must execute successfully from repo root.
2. All command references in governance docs must match executable scripts.
3. Command regression checks must fail if scripts are removed or renamed.

---

## Acceptance Criteria

- [ ] AC1: Running pnpm q:gate from root no longer fails with missing-script error.
- [ ] AC2: Root q:* scripts execute expected delegated commands.
- [ ] AC3: Docs references to q:* commands are consistent with package.json scripts.
- [ ] AC4: Regression check added and documented in walkthrough.

---

## Implementation Steps

1. Add root scripts in package.json.
2. Update docs that define q:* root commands.
3. Add and run command-contract verification commands.

---

## Testing Plan

- pnpm q:gate --source artifacts --scope minor
- pnpm q:tests
- pnpm q:coverage
- pnpm q:lint
- pnpm q:complexity

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
