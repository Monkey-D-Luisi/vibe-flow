# Walkthrough: 0030 -- Consolidate Shared Types and Schemas in Quality Contracts

## Task Reference

- Task: `docs/tasks/0030-consolidate-shared-types-and-schemas-in-quality-contracts.md`
- Epic: Audit remediation 2026-02-27
- Branch: `feat/0030-consolidate-shared-types-and-schemas-quality-contracts`
- PR: _pending_

---

## Summary

Eliminated complexity type duplication (A-004), removed dead loadSchema utility (A-006), documented heuristic vs AST analysis divergence (A-007), and added runtime input validation to 3 quality-gate tool execute handlers (A-008). Complexity types are now defined exactly once in `@openclaw/quality-contracts/complexity/types`.

---

## Context

Source findings A-004, A-006, A-007, A-008 from the 2026-02-27 audit. Both extensions had byte-for-byte identical complexity type files. The loadSchema utility pointed at `packages/schemas/` JSON files but was never imported anywhere. Quality-gate tools accepted `Record<string, unknown>` inputs without any runtime validation, while product-team used strict Typebox schemas.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Move types to quality-contracts | Single source of truth; consistent with existing contracts pattern |
| Document complexity divergence rather than fix it | Heuristic approach is intentional for performance in CLI use case; AST migration is a separate engineering task |
| Remove loadSchema utility | Dead code with no callers — removing eliminates confusion |
| Keep packages/schemas/ JSON files | Reference documentation value; updated README to clarify reference-only status |
| Add validate/tools.ts to quality-contracts | Shared assertion helpers avoid tool-specific boilerplate and enable consistent INVALID_INPUT error format |
| Use TypeScript assertion functions (not Typebox) | quality-gate has no Typebox dependency; simple assertions are sufficient for the optional fields |

---

## Implementation Notes

### Approach

1. Created `packages/quality-contracts/src/complexity/types.ts` with identical type definitions.
2. Added `complexity/types` and `validate/tools` exports to quality-contracts `package.json`.
3. Updated all imports in both extension source files and test files to use `@openclaw/quality-contracts/complexity/types`.
4. Deleted the two local `complexity/types.ts` files and `quality-gate/src/utils/loadSchema.ts`.
5. Added `assertOptional*` validation helpers to `packages/quality-contracts/src/validate/tools.ts`.
6. Added input validation to `complexity.ts`, `gate_enforce.ts`, and `coverage_report.ts` execute handlers.
7. Created `docs/complexity-analysis-discrepancy.md` documenting the heuristic vs AST divergence.
8. Updated `packages/schemas/README.md` to reflect reference-only status.

### AC1 Clarification

AC1 states "grep -r 'FunctionComplexity' extensions/ returns zero results". This AC means zero local definitions. Extensions still **import** `FunctionComplexity` from contracts (correct behavior); the grep for local `export interface FunctionComplexity` in extensions returns zero.

### Key Changes

- Types defined once in shared package instead of twice in separate extensions
- 3 quality-gate execute handlers now reject invalid input types before processing
- packages/schemas/ README accurately describes its reference-only status
- Complexity analysis discrepancy is documented for operators and future engineers

---

## Commands Run

```bash
pnpm typecheck   # PASS
pnpm test        # PASS: 537 tests across 81 test files
pnpm lint        # PASS
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `packages/quality-contracts/src/complexity/types.ts` | Created | Shared complexity types (5 exports: interfaces + DEFAULT_THRESHOLDS) |
| `packages/quality-contracts/src/validate/tools.ts` | Created | Assertion helpers for optional string/number/boolean/array/enum/object |
| `packages/quality-contracts/package.json` | Modified | Added exports for complexity/types and validate/tools |
| `extensions/quality-gate/src/complexity/types.ts` | Deleted | Duplicate — replaced by shared package |
| `extensions/product-team/src/quality/complexity/types.ts` | Deleted | Duplicate — replaced by shared package |
| `extensions/quality-gate/src/utils/loadSchema.ts` | Deleted | Dead code — never imported anywhere |
| `extensions/quality-gate/src/complexity/escomplex.ts` | Modified | Import updated to use quality-contracts |
| `extensions/quality-gate/src/complexity/tsmorph.ts` | Modified | Import updated to use quality-contracts |
| `extensions/quality-gate/src/tools/complexity.ts` | Modified | Import updated; input validation added to execute handler |
| `extensions/quality-gate/src/tools/gate_enforce.ts` | Modified | Import added; input validation added to execute handler |
| `extensions/quality-gate/src/tools/coverage_report.ts` | Modified | Import added; input validation added to execute handler |
| `extensions/product-team/src/quality/complexity/escomplex.ts` | Modified | Import updated to use quality-contracts |
| `extensions/product-team/src/quality/complexity/tsmorph.ts` | Modified | Import updated to use quality-contracts |
| `extensions/product-team/src/tools/quality-complexity.ts` | Modified | Import updated to use quality-contracts |
| `extensions/quality-gate/test/complexity.escomplex.test.ts` | Modified | Import updated in test |
| `extensions/quality-gate/test/complexity.tool.test.ts` | Modified | Import updated in test |
| `extensions/quality-gate/test/complexity.tsmorph.test.ts` | Modified | Import updated in test |
| `extensions/product-team/test/quality/complexity/escomplex.test.ts` | Modified | Import updated in test |
| `extensions/product-team/test/quality/complexity/tsmorph.test.ts` | Modified | Import updated in test |
| `extensions/quality-gate/test/tool.input.validation.test.ts` | Created | Tests for INVALID_INPUT validation on 3 tool execute handlers |
| `packages/schemas/README.md` | Modified | Updated to describe reference-only status and removal of loadSchema |
| `docs/complexity-analysis-discrepancy.md` | Created | Documents heuristic vs AST analysis divergence |
| `docs/roadmap.md` | Modified | Status PENDING -> IN_PROGRESS -> DONE |

---

## Tests

| Suite | Tests | Passed |
|-------|-------|--------|
| quality-gate | 143 | 143 |
| product-team | 394 | 394 |
| Total | 537 | 537 |

---

## Verification Evidence

- `grep -r "export interface FunctionComplexity" extensions/` returns zero results ✅
- `grep -r "loadSchema" . --include="*.ts"` returns zero results ✅
- packages/schemas/README.md describes reference-only status ✅
- 3 quality-gate tools validate input in execute handler ✅
- docs/complexity-analysis-discrepancy.md exists ✅
- pnpm test, pnpm lint, pnpm typecheck all pass ✅

---

## Follow-ups

- Migrate quality-gate complexity from regex heuristics to AST (ts-morph) for accuracy parity — separate engineering task
- Consider running `ts-json-schema-generator` to regenerate packages/schemas/ JSON files from current TypeScript types

---

## Checklist

- [x] Task spec read end-to-end
- [x] AC1-AC6 verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
