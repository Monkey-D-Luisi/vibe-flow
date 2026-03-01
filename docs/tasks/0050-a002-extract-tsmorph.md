# Task 0050: A-002 — Extract tsmorph.ts to quality-contracts (HIGH)

## Source Finding IDs
A-002

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Architecture |
| Severity | HIGH |
| Confidence | HIGH |
| Evidence | `tsmorph.ts` duplicated in both `extensions/quality-gate/src/complexity/` and `extensions/product-team/src/quality/complexity/`; identical logic, no shared canonical source |
| Impact | Same divergence risk as A-001; type signature drift already detectable — `TsMorphFunctionNode.getName()` return type was `string` in one copy but should be `string | undefined` |
| Recommendation | Extract to `packages/quality-contracts/src/complexity/tsmorph.ts`, fix the return type, export from package, update both consumers, delete duplicates |

## Objective
Eliminate the duplicated tsmorph.ts implementation by creating a single canonical version in the shared `@openclaw/quality-contracts` package, fixing the `getName()` return type bug, and updating both extension consumers.

## Acceptance Criteria
- [x] `packages/quality-contracts/src/complexity/tsmorph.ts` created as canonical implementation
- [x] `TsMorphFunctionNode.getName()` return type corrected to `string | undefined`
- [x] `packages/quality-contracts/package.json` exports the new module
- [x] `extensions/product-team` import updated to `@openclaw/quality-contracts`
- [x] `extensions/quality-gate/src/complexity/tsmorph.ts` deleted
- [x] `extensions/product-team/src/quality/complexity/tsmorph.ts` deleted
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes

## Status
DONE
