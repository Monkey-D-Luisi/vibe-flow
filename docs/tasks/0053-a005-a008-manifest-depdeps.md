# Task 0053: A-005 + A-008 — Manifest Entry Point and DevDep Alignment (MEDIUM/LOW)

## Source Finding IDs
A-005, A-008

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Architecture |
| Severity | MEDIUM (A-005: MEDIUM, A-008: LOW) |
| Confidence | HIGH |
| Evidence | A-005: `extensions/quality-gate/package.json` lacks a `main` field; `openclaw.extensions` points to a path that does not exist as a proper entry point; A-008: quality-gate has vitest `^2.0.5` and typescript `^5.6.2` while the rest of the monorepo uses vitest `^3.x` and typescript `^5.7.x` |
| Impact | A-005: extension may fail to resolve at load time in strict environments; A-008: inconsistent toolchain versions increase maintenance burden and risk subtle test incompatibilities |
| Recommendation | A-005: create `extensions/quality-gate/src/index.ts`, add `main` field, fix openclaw.extensions path; A-008: align vitest and typescript versions to monorepo standard |

## Objective
Fix the quality-gate extension manifest by creating a proper entry point and adding a `main` field, and align its development dependency versions (vitest, @vitest/coverage-v8, typescript) with the rest of the monorepo.

## Acceptance Criteria
- [x] `extensions/quality-gate/src/index.ts` created as the canonical entry point
- [x] `extensions/quality-gate/package.json` has `main` field pointing to the entry
- [x] `openclaw.extensions` path in manifest updated to `./src/index.ts`
- [x] `tsconfig.json` include array updated to reference the new index
- [x] vitest bumped from `^2.0.5` to `^3.0.0` in quality-gate
- [x] `@vitest/coverage-v8` bumped from `^2.0.5` to `^3.2.4` in quality-gate
- [x] `typescript` bumped from `^5.6.2` to `^5.7.0` in quality-gate
- [x] `pnpm typecheck` passes

## Status
DONE
