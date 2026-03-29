# Task: 0115 -- Vitest Version Alignment

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP17 -- Security & Stability v2 |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-03-29 |
| Branch | `feat/EP17-security-stability-v2` |

---

## Goal

Align all workspaces to a single, exact vitest version to eliminate the
sporadic test failures caused by version skew (A-004 finding).

---

## Context

The A-004 finding from the 2026-03-05 audit flagged vitest version skew
(^3 in some workspaces, ^4 in others). By the time EP17 started, all
workspaces had already been aligned to `^4.0.18`. The remaining work is
to pin the exact version (remove the `^` caret) to prevent future drift.

---

## Scope

### In Scope

- Pin vitest and @vitest/coverage-v8 to exact `4.0.18` across all workspaces
- Regenerate lockfile
- Verify test stability

### Out of Scope

- Upgrading to newer vitest versions
- pnpm catalog feature adoption

---

## Acceptance Criteria

- [x] AC1: All 8 workspace package.json files pin `vitest: "4.0.18"` (no caret)
- [x] AC2: All 8 workspace package.json files pin `@vitest/coverage-v8: "4.0.18"` (no caret)
- [x] AC3: Root package.json already pinned (verified)
- [x] AC4: `pnpm install` succeeds without errors
- [x] AC5: `pnpm test` passes (2,410 tests, 0 failures)

---

## Definition of Done

- [x] Exact version pinning across all workspaces
- [x] Lockfile regenerated
- [x] All tests pass
- [x] Walkthrough updated
