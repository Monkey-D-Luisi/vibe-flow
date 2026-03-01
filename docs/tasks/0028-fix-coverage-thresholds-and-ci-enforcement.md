# Task: 0028 -- Fix Coverage Thresholds and CI Enforcement

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation 2026-02-27 |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-02-27 |
| Branch | `fix/0028-fix-coverage-thresholds-and-ci-enforcement` |
| Source Finding | D-004, D-006 (audit 2026-02-27) |

---

## Goal

Raise coverage thresholds in both extensions to reflect actual quality levels, and ensure coverage threshold failures explicitly block CI merge rather than running silently.

---

## Context

Source findings: **D-004** (MEDIUM) and **D-006** (MEDIUM).

**D-004**: Both extensions use identical vitest coverage thresholds (`statements: 45%, branches: 70%, functions: 50%, lines: 45%`) regardless of their actual coverage:
- `product-team`: actual 87.51% lines vs 45% threshold — 42-point gap means severe regressions go undetected
- `quality-gate`: actual 46.49% lines vs 45% threshold — barely passing; any small regression fails CI

**D-006**: `.github/workflows/ci.yml` runs `pnpm --filter @openclaw/quality-gate test:coverage` and `pnpm --filter @openclaw/plugin-product-team test:coverage` as CI steps, but the step outcome may not block merge if vitest exits non-zero. Coverage threshold failures need explicit fail-fast behavior in CI.

---

## Scope

### In Scope

- Update `extensions/product-team/vitest.config.ts` coverage thresholds to: `lines: 85, statements: 85, functions: 90, branches: 75`
- Update `extensions/quality-gate/vitest.config.ts` coverage thresholds to: `lines: 50, statements: 50, functions: 60, branches: 75`
- Verify `.github/workflows/ci.yml` coverage steps exit non-zero on threshold failure and block the workflow
- Add `|| exit 1` or equivalent to ensure CI workflow fails fast on coverage miss

### Out of Scope

- Writing new tests to reach higher coverage (tracked in D-001/D-002/D-003 tasks)
- Changing coverage providers or reporters

---

## Requirements

1. `product-team` coverage thresholds must be set to values the extension currently satisfies (based on actual 87.51%/95.13%/79.21% measured coverage) with a safety buffer.
2. `quality-gate` coverage thresholds must be set to values the extension currently satisfies (46.49%/58.33%/80.73%) with a small increment target.
3. Vitest coverage failure must cause the CI workflow to fail and block merge.
4. Existing passing tests must still pass.

---

## Acceptance Criteria

- [x] AC1: `extensions/product-team/vitest.config.ts` has `lines: 85` (or adjusted value ≤ current actual).
- [x] AC2: `extensions/quality-gate/vitest.config.ts` has `lines: 50` (or adjusted value ≤ current actual).
- [x] AC3: A simulated threshold failure (e.g., temporarily lowering actual coverage) causes CI step to exit non-zero.
- [x] AC4: `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass with new thresholds.

---

## Constraints

- Thresholds must not exceed current actual coverage (would break CI immediately).
- Must document the target threshold trajectory in a comment or in the task walkthrough.

---

## Implementation Steps

1. Read `extensions/product-team/vitest.config.ts` and `extensions/quality-gate/vitest.config.ts`.
2. Update product-team thresholds: `lines: 85, statements: 85, functions: 90, branches: 75`.
3. Update quality-gate thresholds: `lines: 50, statements: 50, functions: 60, branches: 75`.
4. Read `.github/workflows/ci.yml` coverage steps; verify each runs with set -e or equivalent.
5. Run `pnpm -r test -- --coverage` to confirm all thresholds pass.
6. Run `pnpm lint && pnpm typecheck`.

---

## Testing Plan

- Run `pnpm -r test -- --coverage` with new thresholds — must pass.
- Verify coverage report shows all metrics above new thresholds.

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Coverage thresholds updated and passing
- [x] CI workflow correctly fails on threshold miss
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] PR created and linked

---

## Finding Snapshot (Immutable)

| Field | Value |
|-------|-------|
| Source Finding IDs | D-004, D-006 |
| Axis | Development |
| Severity | MEDIUM |
| Confidence | HIGH |
| Evidence (D-004) | `product-team/vitest.config.ts` + `quality-gate/vitest.config.ts` — both at `statements: 45, lines: 45`; actual coverage 87.51% and 46.49% respectively |
| Evidence (D-006) | `.github/workflows/ci.yml:49-52` — coverage steps run after other checks; threshold failures may not block merge |
| Impact | Large coverage regression in product-team undetected; quality-gate one small change from CI failure |
| Recommendation | Raise thresholds to reflect actual quality; ensure CI fails on threshold miss |
