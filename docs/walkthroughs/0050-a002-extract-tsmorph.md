# Walkthrough 0050: A-002 — Extract tsmorph.ts to quality-contracts (HIGH)

## Source Finding IDs
A-002

## Execution Journal

### Audit of Duplicate Files
Confirmed two copies of tsmorph.ts existed:
- `extensions/quality-gate/src/complexity/tsmorph.ts`
- `extensions/product-team/src/quality/complexity/tsmorph.ts`

During comparison, identified a type signature bug: `TsMorphFunctionNode.getName()` was declared as returning `string` in both copies, but ts-morph's underlying API can return `undefined` for anonymous functions or arrow functions assigned to variables.

**Commands run:**
```
diff extensions/quality-gate/src/complexity/tsmorph.ts \
     extensions/product-team/src/quality/complexity/tsmorph.ts
grep -n "getName" extensions/quality-gate/src/complexity/tsmorph.ts
```

**Result:** Files functionally identical; return type bug confirmed.

### Create Canonical Implementation with Type Fix
Created `packages/quality-contracts/src/complexity/tsmorph.ts` with `TsMorphFunctionNode.getName()` return type corrected to `string | undefined`.

**Commands run:**
```
cp extensions/quality-gate/src/complexity/tsmorph.ts \
   packages/quality-contracts/src/complexity/tsmorph.ts
# Then edited to fix getName() return type
```

**Result:** Canonical file created with bug fix applied.

### Update Package Exports
Added tsmorph module to `packages/quality-contracts/package.json` exports map alongside the escomplex module.

**Result:** Export added.

### Update Consumer Imports
Updated `extensions/product-team` imports to use `@openclaw/quality-contracts` for the tsmorph module.

**Result:** Import updated.

### Delete Duplicates
Deleted both stale duplicate files:
- `extensions/quality-gate/src/complexity/tsmorph.ts`
- `extensions/product-team/src/quality/complexity/tsmorph.ts`

**Result:** Both files deleted.

### Verification
**Commands run:**
```
pnpm typecheck
pnpm test
```

**Result:** Both commands pass with zero errors; TypeScript strict mode validates the corrected `string | undefined` return type.

## Verification Evidence
- `packages/quality-contracts/src/complexity/tsmorph.ts` — canonical file with fixed `getName()` return type
- Both duplicate files deleted; no remaining references to old paths
- `TsMorphFunctionNode.getName(): string | undefined` correctly typed
- `pnpm typecheck` PASS
- `pnpm test` PASS
- Commit: 302fd11

## Closure Decision
**Status:** DONE_VERIFIED
**Residual risk:** None
**Date:** 2026-03-01
