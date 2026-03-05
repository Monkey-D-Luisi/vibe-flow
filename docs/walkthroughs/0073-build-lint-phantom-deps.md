# Walkthrough 0073: P-004 + P-006 + A-003 + A-006 — Build/Lint Scripts + Phantom Deps + ESLint Alignment (LOW-MEDIUM)

## Source Finding IDs
P-004, P-006, A-003, A-006

## Execution Journal

### Confirm P-004: Missing Lint Script in quality-contracts
Inspected `packages/quality-contracts/package.json`. Confirmed no `lint` script present; `pnpm -r lint` silently skips the package.

### Confirm P-006: Missing Build Script in quality-gate
Inspected `extensions/quality-gate/package.json`. Confirmed no `build` script present; `pnpm -r build` silently skips the package.

### Confirm A-003: Phantom Dependencies
Searched all source files in `extensions/quality-gate/src/` for imports of `ts-morph`, `typhonjs-escomplex`, `ajv`, `ajv-formats`, `fast-glob`, and `picomatch`. None found — all functionality consumed via `@openclaw/quality-contracts`.

### Confirm A-006: ESLint Version Mismatch
Confirmed `extensions/quality-gate/package.json` has ESLint `^8.57.0` while all other workspaces use `^8.57.1`.

### Apply Fixes
1. Added `lint` script to `packages/quality-contracts/package.json`
2. Added `build` script to `extensions/quality-gate/package.json`
3. Removed 6 phantom dependencies from `extensions/quality-gate/package.json`: ts-morph, typhonjs-escomplex, ajv, ajv-formats, fast-glob, picomatch
4. Updated ESLint version to `^8.57.1` in quality-gate

**Commands run:**
```
pnpm install
pnpm -r lint
pnpm -r build
pnpm test
```

**Result:** All commands succeed. No packages silently skipped. All 968 tests pass.

## Verification Evidence
- `quality-contracts` lint script added and executed by `pnpm -r lint`
- `quality-gate` build script added and executed by `pnpm -r build`
- 6 phantom dependencies removed; no import errors
- ESLint aligned to `^8.57.1` across all workspaces
- Commit 999d8f8 merged to main

## Closure Decision
**Status:** DONE
**Residual risk:** None — build/lint coverage complete; install weight reduced
**Date:** 2026-03-05
