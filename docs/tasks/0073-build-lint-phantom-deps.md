# Task 0073: P-004 + P-006 + A-003 + A-006 — Build/Lint Scripts + Phantom Deps + ESLint Alignment (LOW-MEDIUM)

## Source Finding IDs
P-004, P-006, A-003, A-006

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Product (P-004, P-006), Architecture (A-003, A-006) |
| Severity | LOW (P-004, P-006, A-006), MEDIUM (A-003) |
| Confidence | CONFIRMED |
| Evidence | P-004: `packages/quality-contracts/package.json` missing `lint` script — silently skipped by `pnpm -r lint`; P-006: `extensions/quality-gate/package.json` missing `build` script — skipped by `pnpm -r build`; A-003: `extensions/quality-gate/package.json:18-22` has 6 phantom dependencies (ts-morph, typhonjs-escomplex, ajv, ajv-formats, fast-glob, picomatch) never imported; A-006: `extensions/quality-gate/package.json:29` ESLint `^8.57.0` vs `^8.57.1` everywhere else |
| Impact | P-004/P-006: lint and build issues in these packages go undetected in CI; A-003: unnecessary install weight (~50MB for ts-morph alone); A-006: minor version inconsistency |
| Recommendation | Add lint script to quality-contracts; add build script to quality-gate; remove 6 phantom deps; align ESLint version |

## Objective
Add missing build/lint scripts, remove phantom dependencies, and align ESLint version across workspaces.

## Acceptance Criteria
- [x] `packages/quality-contracts/package.json` has a `lint` script
- [x] `extensions/quality-gate/package.json` has a `build` script (or documented exclusion)
- [x] 6 phantom dependencies removed from `extensions/quality-gate/package.json`
- [x] ESLint version aligned to `^8.57.1` in quality-gate
- [x] `pnpm -r lint` and `pnpm -r build` no longer silently skip these packages
- [x] All tests pass after dependency removal

## Status
DONE — commit 999d8f8

## Traceability
| Field | Value |
|-------|-------|
| Audit | 2026-03-05-full-audit.md |
| Findings | P-004, P-006, A-003, A-006 |
| Commit | 999d8f8 |
