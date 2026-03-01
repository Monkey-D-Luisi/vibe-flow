# Task: 0030 -- Consolidate Shared Types and Schemas in Quality Contracts

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation 2026-02-27 |
| Priority | LOW |
| Scope | MAJOR |
| Created | 2026-02-27 |
| Branch | `feat/0030-consolidate-shared-types-and-schemas-quality-contracts` |
| Source Finding | A-004, A-006, A-007, A-008 (audit 2026-02-27) |

---

## Goal

Eliminate remaining type duplication and schema drift between extensions by moving complexity types to shared contracts, cleaning up unused JSON schemas, documenting the complexity analysis divergence, and standardizing quality-gate tool input validation.

---

## Context

Source findings: **A-004** (LOW), **A-006** (LOW), **A-007** (LOW), **A-008** (LOW).

**A-004**: Complexity types (`FunctionComplexity`, `FileComplexity`, `ComplexitySummary`, `ComplexityThresholds`, `DEFAULT_THRESHOLDS`) are byte-for-byte identical in `product-team/src/quality/complexity/types.ts` and `quality-gate/src/complexity/types.ts`.

**A-006**: `packages/schemas/` contains 11 JSON schema files not linked to TypeScript tool definitions. `loadSchema()` utility in quality-gate is exported but never imported anywhere. The JSON schema structure references deprecated property names.

**A-007**: Complexity analysis diverges: product-team uses real ts-morph/escomplex AST parsing; quality-gate uses regex heuristics. Same code produces different metrics depending on which tool runs it.

**A-008**: Quality-gate tool inputs are not validated (accept `Record<string, unknown>`) while product-team enforces strict Typebox schemas for all tool inputs.

---

## Scope

### In Scope

- Move complexity types to `packages/quality-contracts/src/complexity/types.ts`; delete both local copies; update imports in both extensions
- Remove `extensions/quality-gate/src/utils/loadSchema.ts` (dead code)
- Evaluate and clean up `packages/schemas/` JSON files: remove if not serving a documented purpose, or update to match current TypeScript tool schemas
- Add a `docs/complexity-analysis-discrepancy.md` note documenting the heuristic vs AST approach divergence and the intended maintenance strategy
- Add TypeScript input validation to quality-gate tools using the quality-contracts schema types (or Typebox) to match product-team behavior

### Out of Scope

- Migrating quality-gate complexity analysis from heuristic to AST (separate engineering task)
- Changing Typebox schema definitions in product-team

---

## Requirements

1. After this task, `FunctionComplexity` and related types are defined exactly once, in `@openclaw/quality-contracts`.
2. `loadSchema()` is removed with no other file importing it.
3. `packages/schemas/` is either cleaned up (files removed) or regenerated to match current TypeScript types.
4. Quality-gate tools validate their inputs using shared type assertions.
5. The complexity analysis divergence is documented.

---

## Acceptance Criteria

- [ ] AC1: `grep -r "FunctionComplexity" extensions/` returns zero results (all moved to contracts).
- [ ] AC2: `loadSchema` is not referenced anywhere in the codebase.
- [ ] AC3: `packages/schemas/` README accurately describes the state of schema files.
- [ ] AC4: At least 3 quality-gate tool functions validate their `Record<string, unknown>` input against the shared type schema.
- [ ] AC5: `docs/complexity-analysis-discrepancy.md` exists explaining the heuristic vs AST divergence.
- [ ] AC6: `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.

---

## Constraints

- Must not change exported function signatures.
- Cleanup of `packages/schemas/` must be documented in the walkthrough.

---

## Implementation Steps

1. Move complexity types from both extension copies to `packages/quality-contracts/src/complexity/types.ts`.
2. Update all imports in both extensions.
3. Delete `product-team/src/quality/complexity/types.ts` and `quality-gate/src/complexity/types.ts`.
4. Delete `quality-gate/src/utils/loadSchema.ts`.
5. Audit `packages/schemas/` — remove files that are not used or regenerate from TypeScript.
6. Add input validation to quality-gate tools (complexity.ts, gate_enforce.ts, coverage_report.ts).
7. Create `docs/complexity-analysis-discrepancy.md`.
8. Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Testing Plan

- TypeScript compilation validates type import correctness.
- Existing complexity tests in both extensions must pass.
- Input validation tests for the 3+ validated quality-gate tools.

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] PR created and linked

---

## Finding Snapshot (Immutable)

| Field | Value |
|-------|-------|
| Source Finding IDs | A-004, A-006, A-007, A-008 |
| Axis | Architecture |
| Severity | LOW |
| Confidence | HIGH |
| Evidence (A-004) | `product-team/src/quality/complexity/types.ts` vs `quality-gate/src/complexity/types.ts` — byte-for-byte identical |
| Evidence (A-006) | `packages/schemas/` — unused JSON schemas; `quality-gate/src/utils/loadSchema.ts` — never imported |
| Evidence (A-007) | `quality-gate/src/tools/complexity.ts` regex heuristic vs `product-team/src/tools/quality-complexity.ts` ts-morph/escomplex |
| Evidence (A-008) | `quality-gate/src/tools/gate_enforce.ts` — no Typebox/AJV validation layer |
| Impact | Type drift risk; dead code confusion; inconsistent complexity metrics; unvalidated tool inputs |
| Recommendation | Centralize types; remove dead code; document divergence; standardize input validation |
