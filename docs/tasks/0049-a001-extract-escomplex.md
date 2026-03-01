# Task 0049: A-001 — Extract escomplex.ts to quality-contracts (HIGH)

## Source Finding IDs
A-001

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Architecture |
| Severity | HIGH |
| Confidence | HIGH |
| Evidence | `escomplex.ts` duplicated in both `extensions/quality-gate/src/complexity/` and `extensions/product-team/src/quality/complexity/`; identical logic, no shared canonical source |
| Impact | Divergence risk — fixes and improvements must be applied to two places; increases maintenance burden and risk of subtle bugs from drift |
| Recommendation | Extract to `packages/quality-contracts/src/complexity/escomplex.ts`, export from package, update both consumers, delete duplicates |

## Objective
Eliminate the duplicated escomplex.ts implementation by creating a single canonical version in the shared `@openclaw/quality-contracts` package and updating both extension consumers to import from it.

## Acceptance Criteria
- [x] `packages/quality-contracts/src/complexity/escomplex.ts` created as canonical implementation
- [x] `packages/quality-contracts/package.json` exports the new module
- [x] `extensions/product-team/src/tools/quality-complexity.ts` updated to import from `@openclaw/quality-contracts`
- [x] `extensions/quality-gate/src/complexity/escomplex.ts` deleted
- [x] `extensions/product-team/src/quality/complexity/escomplex.ts` deleted
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes

## Status
DONE
