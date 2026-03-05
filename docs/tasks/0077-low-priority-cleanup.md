# Task 0077: A-005 + SEC-006 + SEC-007 + D-011 + D-012 — Low-Priority Cleanup (LOW)

## Source Finding IDs
A-005, SEC-006, SEC-007, D-011, D-012

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Architecture (A-005), Security (SEC-006, SEC-007), Development (D-011, D-012) |
| Severity | LOW |
| Confidence | CONFIRMED |
| Evidence | A-005: 20 re-export shim files across quality-gate and product-team (10 each) that re-export from `@openclaw/quality-contracts`; SEC-006: `extensions/product-team/src/registration/http-routes.ts:34` — `/health` endpoint returns internal status without authentication; SEC-007: `packages/quality-contracts/src/fs/read.ts:9` — `readFileSafe` has no intrinsic path containment (callers use `assertPathContained` but function itself has no guard); D-011: `extensions/product-team/src/hooks/auto-spawn.ts:147` — deprecated `buildSpawnDirective` still exported and tested; D-012: `ci.yml`, `quality-gate.yml`, `release.yml` — duplicated CI setup steps across 3 workflows |
| Impact | A-005: 20 files that must update in lockstep when shared package changes; SEC-006: information disclosure of internal component status if endpoint is internet-facing; SEC-007: defense-in-depth gap if a caller forgets `assertPathContained`; D-011: dead code increases maintenance surface; D-012: CI step duplication increases drift risk |
| Recommendation | A-005: import directly from quality-contracts, remove shims; SEC-006: add optional bearer-token auth to /health; SEC-007: add optional `root` parameter for intrinsic containment; D-011: remove deprecated function if unused; D-012: extract shared composite action |

### Per-Finding Detail

| ID | Summary | Action |
|----|---------|--------|
| A-005 | 20 re-export shim files | Remove shims, update imports to use quality-contracts directly |
| SEC-006 | Unauthenticated /health | Add optional bearer-token auth |
| SEC-007 | readFileSafe no root param | Add optional `root` parameter for defense-in-depth |
| D-011 | Deprecated buildSpawnDirective | Remove deprecated export and tests |
| D-012 | Duplicated CI setup steps | Extract shared composite action |

## Objective
Address five low-priority cleanup items: eliminate re-export shims, add health endpoint auth, add readFileSafe root parameter, remove deprecated code, and consolidate CI setup.

## Acceptance Criteria
- [ ] 20 re-export shim files removed; all imports updated to reference `@openclaw/quality-contracts` directly
- [ ] `/health` endpoint supports optional bearer-token authentication
- [ ] `readFileSafe` accepts optional `root` parameter for intrinsic path containment
- [ ] `buildSpawnDirective` removed from exports and associated tests cleaned up
- [ ] Shared CI composite action created; `ci.yml`, `quality-gate.yml`, `release.yml` use it
- [ ] All tests pass
- [ ] `pnpm lint` and `pnpm typecheck` pass

## Status
PLANNED

## Traceability
| Field | Value |
|-------|-------|
| Audit | 2026-03-05-full-audit.md |
| Findings | A-005, SEC-006, SEC-007, D-011, D-012 |
