# Walkthrough 0077: A-005 + SEC-006 + SEC-007 + D-011 + D-012 — Low-Priority Cleanup (LOW)

## Source Finding IDs
A-005, SEC-006, SEC-007, D-011, D-012

## Execution Journal

Pending — task not yet started.

### Planned Approach

#### A-005: Remove Re-Export Shims
1. Identify all 20 re-export shim files (10 in quality-gate, 10 in product-team)
2. Update all import sites to reference `@openclaw/quality-contracts` directly
3. Delete the shim files
4. Verify no broken imports via `pnpm typecheck`

#### SEC-006: Health Endpoint Auth
1. Add optional `HEALTH_AUTH_TOKEN` environment variable support to `/health` route
2. When set, require `Authorization: Bearer <token>` header
3. When unset, endpoint remains open (backward compatible)
4. Add tests for both authenticated and unauthenticated access

#### SEC-007: readFileSafe Root Parameter
1. Add optional `root?: string` parameter to `readFileSafe`
2. When provided, validate resolved path is within root using `assertPathContained`
3. Existing callers unaffected (parameter is optional)
4. Add tests for root containment validation

#### D-011: Remove buildSpawnDirective
1. Confirm `buildSpawnDirective` is not called anywhere except tests
2. Remove the deprecated export from `auto-spawn.ts`
3. Remove associated test cases
4. Verify no other references remain

#### D-012: Extract CI Composite Action
1. Create `.github/actions/setup/action.yml` composite action with shared setup steps
2. Update `ci.yml`, `quality-gate.yml`, `release.yml` to use the composite action
3. Verify CI workflows still function correctly

### Commands to Run
```
pnpm typecheck
pnpm lint
pnpm test
```

## Verification Evidence
Pending

## Closure Decision
**Status:** PLANNED
**Date:** 2026-03-05
