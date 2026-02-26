# Task: 0018 -- Fix Plugin Lifecycle Listeners and Hotspot Maintainability

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation |
| Priority | MEDIUM |
| Scope | MAJOR |
| Created | 2026-02-25 |
| Branch | feat/0018-fix-plugin-lifecycle-listeners-and-hotspot-maintainability |
| Source Finding IDs | A-004, D-004 |

---

## Goal

Stabilize plugin lifecycle behavior and reduce maintainability risk in high-churn hotspots.

---

## Immutable Finding Snapshot (Do Not Edit)

| ID | Axis | Severity | Evidence | Impact | Recommendation |
|----|------|----------|----------|--------|----------------|
| A-004 | Architecture | SHOULD_FIX | Repeated plugin registration adds process listeners and triggers MaxListenersExceededWarning. | Lifecycle noise and potential listener-leak behavior in repeated initialization paths. | Register shutdown hooks idempotently or through lifecycle-safe mechanism. |
| D-004 | Development | LOW | Hotspots identified in large files with high change burden. | Maintenance friction and elevated regression risk. | Split high-churn files with characterization tests and bounded responsibilities. |

---

## Scope

### In Scope

- Make shutdown/listener registration idempotent.
- Refactor one or more hotspot files with characterization tests.
- Document remaining hotspots and phased refactor plan.

### Out of Scope

- Large-scale architecture rewrite.
- Changing unrelated modules.

---

## Requirements

1. No MaxListenersExceededWarning under repeated plugin init tests.
2. Refactors preserve behavior with test coverage.
3. Hotspot reduction work is traceable and staged.

---

## Acceptance Criteria

- [ ] AC1: Repeated initialization tests no longer trigger listener warnings.
- [ ] AC2: Targeted hotspot files are split or simplified with behavior parity tests.
- [ ] AC3: Refactor notes and residual risk are documented.
- [ ] AC4: All affected tests/lint/typecheck pass.

---

## Implementation Steps

1. Add failing regression for repeated listener registration.
2. Implement idempotent lifecycle hook registration.
3. Refactor hotspot slice with characterization tests.

---

## Testing Plan

- pnpm --filter @openclaw/plugin-product-team test
- pnpm lint
- pnpm typecheck

---

## Definition of Done

- [x] Acceptance criteria validated with command-backed evidence
- [x] Implementation completed with no scope drift
- [x] Tests added or updated and passing
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated with execution journal and closure decision

---

## Agent References

- [Findings Processing Workflow](../../.agent/rules/findings-processing-workflow.md)
- [Source Audit](../audits/2026-02-25-comprehensive-audit-product-security-architecture-development.md)
