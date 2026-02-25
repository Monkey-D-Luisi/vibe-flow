# Walkthrough: 0012 -- Align Runbook, Schema, and Runtime Config Contract

## Task Reference

- Task: docs/tasks/0012-align-runbook-schema-and-runtime-config-contract.md
- Source Finding IDs: P-003
- Branch: feat/0012-align-runbook-schema-and-runtime-config-contract
- Status: DONE_VERIFIED

---

## Summary

Aligned the product-team workflow configuration contract across runtime parsing,
plugin manifest schema, and runbook documentation.

Goal restatement: remove contract drift so documented workflow settings validate
against `openclaw.plugin.json`, and runtime only consumes declared keys.

---

## Execution Journal

### Decisions and Trade-offs

- Canonical contract: `plugins.entries.product-team.config.workflow.*`.
- Legacy root-level `concurrency` fallback was removed from runtime parsing to
  prevent undeclared key consumption.
- Added explicit contract tests that validate the runbook JSON snippet against
  the plugin schema to catch future documentation/schema drift.

### Implementation

1. Extended `extensions/product-team/openclaw.plugin.json` with `workflow`
   schema properties (`transitionGuards`, `concurrency`) including defaults and
   bounds.
2. Updated runtime parsing in `extensions/product-team/src/index.ts` so
   `resolveConcurrencyConfig` reads only `workflow.concurrency`.
3. Updated `docs/runbook.md` to state canonical workflow key ownership.
4. Added `extensions/product-team/test/config/workflow-config-contract.test.ts`
   for schema/doc/runtime contract validation.

### Commands Run

~~~bash
git checkout main
git pull origin main
git checkout -b feat/0012-align-runbook-schema-and-runtime-config-contract
pnpm --filter @openclaw/plugin-product-team test
pnpm --filter @openclaw/plugin-product-team lint
pnpm --filter @openclaw/plugin-product-team typecheck
pnpm test
pnpm lint
pnpm typecheck
~~~

### Verification Evidence

| Check | Result | Evidence |
|------|--------|----------|
| Implementation complete | PASS | Schema/runtime/runbook/test updates merged in one change set |
| Tests pass | PASS | `pnpm --filter @openclaw/plugin-product-team test`, `pnpm test` |
| Lint pass | PASS | `pnpm --filter @openclaw/plugin-product-team lint`, `pnpm lint` |
| Typecheck pass | PASS | `pnpm --filter @openclaw/plugin-product-team typecheck`, `pnpm typecheck` |

### Files Changed

- `extensions/product-team/openclaw.plugin.json`
- `extensions/product-team/src/index.ts`
- `extensions/product-team/test/config/workflow-config-contract.test.ts`
- `docs/runbook.md`
- `docs/roadmap.md`

---

## Closure Decision

- Current status: DONE_VERIFIED
- Closure criteria met: YES
- Notes: Contract drift for finding P-003 is remediated with automated contract
  tests guarding schema/doc/runtime alignment.

---

## Checklist

- [x] Source findings linked for traceability
- [x] Commands executed and recorded
- [x] Verification evidence attached
- [x] Closure decision updated to DONE_VERIFIED
