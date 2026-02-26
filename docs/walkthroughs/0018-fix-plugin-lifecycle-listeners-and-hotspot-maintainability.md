# Walkthrough: 0018 -- Fix Plugin Lifecycle Listeners and Hotspot Maintainability

## Task Reference

- Task: docs/tasks/0018-fix-plugin-lifecycle-listeners-and-hotspot-maintainability.md
- Source Finding IDs: A-004, D-004
- Branch: feat/0018-fix-plugin-lifecycle-listeners-and-hotspot-maintainability
- Status: IN_PROGRESS

---

## Summary

Goal restated: stop listener accumulation during repeated plugin initialization
and reduce hotspot risk in `extensions/product-team/src/index.ts` by extracting
bounded responsibilities with parity coverage.

Implemented by:

1. Replacing direct `process.once(...)` registration with idempotent hook
   management in `src/lifecycle/process-shutdown.ts`.
2. Extracting plugin config resolution from `src/index.ts` into
   `src/config/plugin-config.ts`.
3. Adding regression and characterization tests for listener behavior and
   config contract parity.

---

## Execution Journal

### Decisions

1. Used replacement semantics for shutdown hooks (remove old listeners, register
   one fresh set) so repeated `register()` calls do not stack listeners.
2. Kept `resolveConcurrencyConfig` API stable by re-exporting it from
   `src/index.ts` to avoid downstream test breakage.
3. Chose `index.ts` as the D-004 hotspot slice and decomposed configuration and
   lifecycle concerns into dedicated modules with focused tests.
4. Left other hotspot files (`github/pr-bot.ts`, `github/ci-feedback.ts`,
   `project-sync.yml`, `transition-guards.test.ts`) for a follow-up slice to
   avoid scope drift.

### Commands Run

~~~bash
git checkout main
git pull origin main
git checkout -b feat/0018-fix-plugin-lifecycle-listeners-and-hotspot-maintainability
pnpm --filter @openclaw/plugin-product-team test -- test/index.test.ts test/config/plugin-config.test.ts
pnpm test
pnpm lint
pnpm typecheck
~~~

### Files Changed

- `extensions/product-team/src/index.ts`
- `extensions/product-team/src/config/plugin-config.ts` (new)
- `extensions/product-team/src/lifecycle/process-shutdown.ts` (new)
- `extensions/product-team/test/index.test.ts`
- `extensions/product-team/test/config/plugin-config.test.ts` (new)
- `docs/roadmap.md`

### Verification Evidence

| Check | Result | Evidence |
|------|--------|----------|
| Implementation complete | PASS | Listener lifecycle made registration-safe via `registerProcessShutdownHooks`; `index.ts` reduced from hotspot size by extracting config + lifecycle modules |
| Tests pass | PASS | `pnpm test` succeeded (`product-team`: 58 files/348 tests, `quality-gate`: 14 files/137 tests) |
| Lint pass | PASS | `pnpm lint` succeeded in all workspaces |
| Typecheck pass | PASS | `pnpm typecheck` succeeded in all workspaces |

---

## Closure Decision

- Current status: IMPLEMENTED_PENDING_STATUS_FLIP
- Closure criteria met: NO (final task/roadmap status update still pending)
- Notes: No scope drift. Residual D-004 hotspots are documented as follow-up candidates.

---

## Checklist

- [x] Source findings linked for traceability
- [x] Commands executed and recorded
- [x] Verification evidence attached
- [ ] Closure decision updated to DONE_VERIFIED
