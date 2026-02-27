# Walkthrough: 0022 -- Fix Plugin Schema / Runbook Workflow Config Drift

## Task Reference

- Task: `docs/tasks/0022-fix-plugin-schema-workflow-config-drift.md`
- Epic: Audit remediation 2026-02-27
- Branch: `fix/0022-plugin-schema-workflow-config-drift`
- PR: [#184](https://github.com/Monkey-D-Luisi/vibe-flow/pull/184)

---

## Summary

Finding D-007 was **already resolved** by task 0012 (Align Runbook, Schema, and Runtime Config Contract). On inspection, all three acceptance criteria were satisfied before this task began:

- `openclaw.plugin.json` configSchema already declares `workflow` at lines 72-101 with full JSON Schema for `transitionGuards` and `concurrency`.
- `docs/runbook.md` config example matches the schema exactly.
- `test/config/workflow-config-contract.test.ts` (4 tests) already validates runbook config against the schema using Ajv.

This task's implementation was limited to: registering new tasks 0022-0031 in `docs/roadmap.md` (housekeeping from the process-findings run), verifying all ACs, and marking the finding closed.

---

## Context

The audit snapshot (2026-02-27) that generated finding D-007 was captured before task 0012's changes were fully reflected. Task 0012 had already added `workflow` to the plugin schema and created the `workflow-config-contract.test.ts` contract test. No code changes were needed.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Mark DONE without code changes | All ACs already satisfied; adding duplicate code would be backwards-compat cruft |
| Register tasks 0022-0031 in roadmap | Required by autonomous-workflow Step 1 so future `next task` runs can pick them up |

---

## Implementation Notes

### Approach

Investigation-first. Read `openclaw.plugin.json` (lines 72-101) and `test/config/workflow-config-contract.test.ts` to confirm the fix was already in place. Ran the full test suite to verify.

### Key Changes

Only `docs/roadmap.md` was modified (adding the 10 new task entries). No source or test files changed.

---

## Commands Run

```bash
git checkout main
git pull origin main
git checkout -b fix/0022-plugin-schema-workflow-config-drift

# Verification
pnpm --filter @openclaw/plugin-product-team test   # workflow-config-contract.test.ts ✓ 4 tests
pnpm test    # 504 tests passed
pnpm lint    # clean
pnpm typecheck  # clean
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `docs/roadmap.md` | Modified | Added task entries 0022-0031 to Task Specs section |
| `docs/walkthroughs/0022-fix-plugin-schema-workflow-config-drift.md` | Modified | This walkthrough |
| `docs/tasks/0022-fix-plugin-schema-workflow-config-drift.md` | Modified | Status → DONE, DoD checked |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| workflow-config-contract | 4 | 4 | n/a |
| Total (all packages) | 504 | 504 | 87.51% / 46.49% |

---

## Verification Evidence

- AC1: `workflow-config-contract.test.ts:57-68` — runbook JSON validated against schema via Ajv → passes
- AC2: `openclaw.plugin.json:72-101` — `workflow` property declared with `additionalProperties: false`
- AC3: `test/config/workflow-config-contract.test.ts` exists with 4 tests
- AC4: `pnpm test && pnpm lint && pnpm typecheck` — all pass

---

## Follow-ups

- Audit generation should account for prior remediation task history before creating findings (to avoid stale findings).

---

## Checklist

- [x] Task spec read end-to-end
- [x] AC1: Runbook config valid against schema
- [x] AC2: `workflow` in schema
- [x] AC3: Contract test exists
- [x] AC4: Quality gates passed
- [x] Files changed section complete
