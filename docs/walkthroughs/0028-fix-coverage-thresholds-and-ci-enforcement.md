# Walkthrough: 0028 -- Fix Coverage Thresholds and CI Enforcement

## Task Reference

- Task: `docs/tasks/0028-fix-coverage-thresholds-and-ci-enforcement.md`
- Epic: Audit remediation 2026-02-27
- Branch: `fix/0028-fix-coverage-thresholds-and-ci-enforcement`
- PR: _pending_

---

## Summary

Raised coverage thresholds in both extensions to reflect actual quality levels measured after Task 0027 (behavioral test coverage work), and made CI fail-fast behavior explicit for the coverage policy step.

---

## Context

Source findings D-004 and D-006 from the 2026-02-27 audit. Both extensions had been using identical boilerplate thresholds (`statements: 45, branches: 70, functions: 50, lines: 45`) that did not reflect actual coverage. After Task 0027's test additions, quality-gate actual coverage rose from ~46% to ~61% lines. product-team remained at ~89% lines. The CI `.github/workflows/ci.yml` coverage step used implicit bash fail-fast (GitHub Actions default `-eo pipefail`) but lacked explicit documentation of this intent.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| product-team: lines 85, statements 85, functions 90, branches 75 | Below actual (89.79% lines, 96.33% functions, 79.6% branches) with a ~5-point safety buffer; prevents severe regressions going undetected |
| quality-gate: lines 50, statements 50, functions 60, branches 75 | Below actual (61.36% lines, 63.15% functions, 81.7% branches) — safe with Task 0027's added tests; small increment above legacy 45% baseline |
| Added `set -e` + `|| exit 1` to CI coverage step | Makes fail-fast intent explicit and self-documenting; satisfies D-006 finding regardless of GitHub Actions runner defaults |
| Added threshold comments to vitest configs | Documents target trajectory (raise by ~5 pts per quarter) and the actual coverage baseline used to size each threshold |

---

## Implementation Notes

### Approach

Read both vitest configs and the CI workflow. Ran `pnpm --filter @openclaw/quality-gate test:coverage` first to get current actual numbers (not available in task spec since Task 0027 had since run). Confirmed all proposed thresholds sat safely below actual before applying. Updated CI to add `set -e` and explicit `|| exit 1` per-command.

### Key Changes

- `extensions/product-team/vitest.config.ts`: raised from `{45/70/50/45}` to `{85/75/90/85}` for `{stmts/branches/funcs/lines}`
- `extensions/quality-gate/vitest.config.ts`: raised from `{45/70/50/45}` to `{50/75/60/50}`
- `.github/workflows/ci.yml`: added `set -e` header and `|| exit 1` suffix to each coverage command in the `Coverage policy` step

---

## Commands Run

```bash
# Verify current quality-gate coverage before setting thresholds
pnpm --filter @openclaw/quality-gate test:coverage

# Verify product-team coverage passes new thresholds
pnpm --filter @openclaw/plugin-product-team test:coverage

# Full quality gate
pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/vitest.config.ts` | Modified | Raise thresholds to `{stmts:85, branches:75, funcs:90, lines:85}`; add trajectory comment |
| `extensions/quality-gate/vitest.config.ts` | Modified | Raise thresholds to `{stmts:50, branches:75, funcs:60, lines:50}`; add trajectory comment |
| `.github/workflows/ci.yml` | Modified | Add `set -e` + `|| exit 1` to Coverage policy step for explicit fail-fast |
| `docs/roadmap.md` | Modified | Task 0028 status `PENDING` → `DONE` |

---

## Tests

| Suite | Tests | Passed | Coverage (product-team) | Coverage (quality-gate) |
|-------|-------|--------|-------------------------|--------------------------|
| All | 394 | 394 | lines: 89.79% | lines: 61.36% |
| — | — | — | stmts: 89.79% | stmts: 61.36% |
| — | — | — | funcs: 96.33% | funcs: 63.15% |
| — | — | — | branches: 79.6% | branches: 81.7% |

All new thresholds satisfied with margin.

---

## Verification Evidence

- product-team: lines 89.79% ≥ 85 ✓ | stmts 89.79% ≥ 85 ✓ | funcs 96.33% ≥ 90 ✓ | branches 79.6% ≥ 75 ✓
- quality-gate: lines 61.36% ≥ 50 ✓ | stmts 61.36% ≥ 50 ✓ | funcs 63.15% ≥ 60 ✓ | branches 81.7% ≥ 75 ✓
- CI fail-fast: explicit `set -e` + `|| exit 1` added to Coverage policy step

---

## Follow-ups

- Task 0029 (Refactor Large GitHub Module Files) and 0030/0031 remain PENDING.
- quality-gate `complexity.ts`, `coverage_report.ts`, `index.ts`, and `loadSchema.ts` are at 0% coverage — candidates for future test additions once tool usage is mapped.
- Consider raising quality-gate thresholds to 65%+ once uncovered `tools/` files gain tests.

---

## Checklist

- [x] Task spec read end-to-end
- [x] AC1-AC4 verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
