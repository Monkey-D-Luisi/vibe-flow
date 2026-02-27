# Walkthrough: 0028 -- Fix Coverage Thresholds and CI Enforcement

## Task Reference

- Task: `docs/tasks/0028-fix-coverage-thresholds-and-ci-enforcement.md`
- Epic: Audit remediation 2026-02-27
- Branch: `fix/0028-fix-coverage-thresholds-and-ci-enforcement`
- PR: _pending_

---

## Summary

_To be completed when task is implemented._

---

## Context

Source findings D-004 (threshold vs actual gap) and D-006 (CI coverage silent failure) from the 2026-02-27 audit. product-team at 87.51% with 45% threshold; quality-gate at 46.49% with 45% threshold.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| product-team: lines 85% | Below actual (87.51%) with buffer; prevents regression |
| quality-gate: lines 50% | Slight increment above actual (46.49%); achievable with D-001 work |

---

## Implementation Notes

_To be completed when task is implemented._

---

## Commands Run

```bash
pnpm -r test -- --coverage
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/vitest.config.ts` | Modified | Raise coverage thresholds |
| `extensions/quality-gate/vitest.config.ts` | Modified | Raise coverage thresholds |
| `.github/workflows/ci.yml` | Modified | Ensure coverage step fails workflow |

---

## Verification Evidence

- product-team: all metrics above new thresholds: _pending_
- quality-gate: all metrics above new thresholds: _pending_
- CI fails on simulated threshold miss: _pending_

---

## Checklist

- [ ] Task spec read end-to-end
- [ ] AC1-AC4 verified
- [ ] Quality gates passed
- [ ] Files changed section complete
