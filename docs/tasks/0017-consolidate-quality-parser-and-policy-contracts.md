# Task: 0017 -- Consolidate Quality Parser and Policy Contracts

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation |
| Priority | MEDIUM |
| Scope | MAJOR |
| Created | 2026-02-25 |
| Branch | feat/0017-consolidate-quality-parser-and-policy-contracts |
| Source Finding IDs | A-001, A-002, A-003 |

---

## Goal

Remove duplicated quality logic and enforce one architecture contract for parsers, gate policy, and config semantics.

---

## Immutable Finding Snapshot (Do Not Edit)

| ID | Axis | Severity | Evidence | Impact | Recommendation |
|----|------|----------|----------|--------|----------------|
| A-001 | Architecture | SHOULD_FIX | Duplicated parser implementations across quality-gate and product-team. | High drift risk and duplicated maintenance effort. | Extract shared parser module or package and consume from both extensions. |
| A-002 | Architecture | SHOULD_FIX | Gate policy semantics differ across duplicate implementations. | Inconsistent gate outcomes by execution surface. | Define and reuse one canonical policy engine. |
| A-003 | Architecture | SHOULD_FIX | Runtime config consumption and schema declarations are inconsistent. | Architecture contract ambiguity across layers. | Enforce schema-first contract and add tests. |

---

## Scope

### In Scope

- Extract shared quality parser module consumed by both extensions.
- Unify gate policy behavior into a single canonical implementation.
- Add architecture contract tests to prevent drift.

### Out of Scope

- Feature expansion of quality tools.
- Non-quality module refactors.

---

## Requirements

1. Shared parser implementation becomes the single source of truth.
2. Gate policy outputs are consistent across product-team and quality-gate.
3. Schema and runtime config contract mismatches are tested and prevented.

---

## Acceptance Criteria

- [ ] AC1: Parser duplication is removed or strictly delegated to shared module.
- [ ] AC2: Gate policy behavior parity tests pass across both surfaces.
- [ ] AC3: Config-contract tests fail on schema/runtime drift.
- [ ] AC4: All affected package tests/lint/typecheck pass.

---

## Implementation Steps

1. Create shared quality module or package.
2. Refactor both extensions to consume shared logic.
3. Add parity and contract regression tests.

---

## Testing Plan

- pnpm --filter @openclaw/plugin-product-team test
- pnpm --filter @openclaw/quality-gate test
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
