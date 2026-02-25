# Walkthrough: 0007 -- Hardening

## Task Reference

- Task: `docs/tasks/0007-hardening.md`
- Epic: EP06 -- Hardening
- Branch: `feat/0007-hardening`
- PR: `https://github.com/Monkey-D-Luisi/vibe-flow/pull/167`

---

## Summary

Implemented EP06 hardening for the product-team plugin:

- allow-list validation script with CI enforcement
- cost tracking events (`cost.llm`, `cost.tool`, `cost.warning`) and `task.get` cost summary
- metadata secret detection + structured log scrubbing
- concurrency limits with `LeaseCapacityError`
- operator documentation (`runbook`, `api-reference`, allow-list rationale)

---

## Context

After EP05, workflow and quality features were complete. This task focused on
production-readiness controls and operational docs without changing the core
task lifecycle model.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Keep a single allow-list validator at repo root (`scripts/validate-allowlists.ts`) | Matches EP06/task spec and avoids duplicated validation logic |
| Wrap tools with `withCostTracking` at registry level (`getAllToolDefs`) | Centralized enforcement for every tool with no per-tool duplication |
| Emit budget overages as warning events and metadata flags (soft limit) | Task spec requires warnings without hard-blocking execution |
| Enforce concurrency limits in transition path via `state-machine` using lease counts | Guarantees limit checks on lifecycle-critical operations (`task.transition`, `workflow.step.run`) |
| Scrub secrets in correlated logger payload serialization | Ensures sensitive values are not leaked to logs |

---

## Implementation Notes

### Approach

1. Added hardening primitives (secret detector, cost summary, tool wrapper,
   lease capacity checks).
2. Integrated those primitives into existing tools/orchestrator code paths.
3. Added/updated unit tests around each new behavior.
4. Added operational docs and CI enforcement for allow-lists.

### Key Changes

- Added validator script: `scripts/validate-allowlists.ts`
- Added docs:
  - `docs/allowlist-rationale.md`
  - `docs/runbook.md`
  - `docs/api-reference.md`
- Added secret module: `src/security/secret-detector.ts`
- Added cost module + wrapper:
  - `src/cost/cost-summary.ts`
  - `src/tools/cost-tracking.ts`
- Extended event log with cost event helpers
- Added `LeaseCapacityError` + lease count queries and capacity checks
- Updated task/workflow tools to use cost summary, metadata secret checks, and
  concurrency config
- Updated CI to run allow-list validation before typecheck

---

## Commands Run

```bash
git checkout main
git pull origin main
git checkout -b feat/0007-hardening

pnpm tsx scripts/validate-allowlists.ts
pnpm --filter @openclaw/plugin-product-team test
pnpm --filter @openclaw/plugin-product-team lint
pnpm --filter @openclaw/plugin-product-team typecheck

pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `scripts/validate-allowlists.ts` | Added | Enforces registered tools + role policy for allow-lists |
| `.github/workflows/ci.yml` | Modified | Added allow-list validation CI step |
| `openclaw.json` | Modified | Normalized agent allow-lists to dot-notation tool names |
| `extensions/product-team/src/security/secret-detector.ts` | Added | Secret detection + scrubbing helpers |
| `extensions/product-team/src/cost/cost-summary.ts` | Added | Cost aggregation and budget warning metadata helpers |
| `extensions/product-team/src/tools/cost-tracking.ts` | Added | Cross-tool duration tracking + budget warning emission |
| `extensions/product-team/src/orchestrator/event-log.ts` | Modified | Added cost logging methods |
| `extensions/product-team/src/domain/errors.ts` | Modified | Added `LeaseCapacityError` |
| `extensions/product-team/src/persistence/lease-repository.ts` | Modified | Added `countByAgent` and `countActive` |
| `extensions/product-team/src/orchestrator/lease-manager.ts` | Modified | Added concurrency checks for lease acquisition |
| `extensions/product-team/src/orchestrator/state-machine.ts` | Modified | Enforced lease capacity on transition path |
| `extensions/product-team/src/schemas/workflow-step-run.schema.ts` | Modified | Added optional LLM cost payload to workflow steps |
| `extensions/product-team/src/orchestrator/step-runner.ts` | Modified | Emits `cost.llm` events for `llm-task` steps |
| `extensions/product-team/src/tools/task-create.ts` | Modified | Rejects secret-like metadata on create |
| `extensions/product-team/src/tools/task-update.ts` | Modified | Rejects secret-like metadata on update |
| `extensions/product-team/src/tools/task-get.ts` | Modified | Returns `costSummary` |
| `extensions/product-team/src/tools/index.ts` | Modified | Applies `withCostTracking` wrapper to all tools |
| `extensions/product-team/src/index.ts` | Modified | Resolves and passes concurrency config |
| `extensions/product-team/test/**` | Modified/Added | Tests for secret detection, cost tracking, lease capacity, and summaries |
| `README.md` | Modified | Added architecture mermaid + docs references |
| `docs/runbook.md` | Added | Operational guidance and troubleshooting |
| `docs/api-reference.md` | Added | Tool contract reference with examples |
| `docs/allowlist-rationale.md` | Added | Role-by-role allow-list rationale |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| `@openclaw/plugin-product-team` | 303 | 303 | N/A |
| `@openclaw/quality-gate` | 135 | 132 (3 skipped) | N/A |
| Workspace lint/typecheck | N/A | Pass | N/A |

---

## Follow-ups

- Add dedicated automated tests for `scripts/validate-allowlists.ts` error paths
  (unknown tool, wildcard, duplicate) in a future maintenance task.

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
