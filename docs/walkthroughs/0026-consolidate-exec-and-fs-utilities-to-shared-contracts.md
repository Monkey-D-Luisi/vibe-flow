# Walkthrough: 0026 -- Consolidate exec/spawn and fs Utilities to Shared Contracts

## Task Reference

- Task: `docs/tasks/0026-consolidate-exec-and-fs-utilities-to-shared-contracts.md`
- Epic: Audit remediation 2026-02-27
- Branch: `feat/0026-consolidate-exec-fs-utilities-to-shared-contracts`
- PR: _pending_

---

## Summary

_To be completed when task is implemented._

---

## Context

Source findings A-003 (spawn utility 99%+ duplicated) and A-002 (fs utilities ~95% duplicated) from the 2026-02-27 audit. Security-critical spawn logic duplicated in both extensions means security patches must be applied in two places.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Extract to quality-contracts | Already the shared package for both extensions |
| Keep github/spawn.ts separate | Intentionally different constraints (gh only, 1 MB buffer, env isolation) |

---

## Implementation Notes

_To be completed when task is implemented._

---

## Commands Run

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `packages/quality-contracts/src/exec/spawn.ts` | Created | Consolidated spawn utility |
| `packages/quality-contracts/src/fs/glob.ts` | Created | Consolidated glob utility |
| `packages/quality-contracts/src/fs/read.ts` | Created | Consolidated read utility |
| `product-team/src/exec/spawn.ts` | Deleted | Replaced by shared contracts |
| `quality-gate/src/exec/spawn.ts` | Deleted | Replaced by shared contracts |
| Multiple import files | Modified | Updated to point to shared location |

---

## Verification Evidence

- No `product-team/src/exec/spawn.ts` exists: _pending_
- No `quality-gate/src/exec/spawn.ts` exists: _pending_
- All existing spawn tests pass: _pending_

---

## Checklist

- [ ] Task spec read end-to-end
- [ ] AC1-AC5 verified
- [ ] Quality gates passed
- [ ] Files changed section complete
