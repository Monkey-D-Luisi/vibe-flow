# Walkthrough: 0006 -- Quality & Observability

## Task Reference

- Task: `docs/tasks/0006-quality-observability.md`
- Epic: EP05 -- Quality & Observability
- Branch: `feat/0006-quality-observability`
- PR: `https://github.com/Monkey-D-Luisi/vibe-flow/pull/166`

---

## Summary

Implemented EP05 quality and observability capabilities inside
`extensions/product-team`:
- added six tools: `quality.tests`, `quality.coverage`, `quality.lint`,
  `quality.complexity`, `quality.gate`, `workflow.events.query`
- consolidated quality parsing/complexity/gate modules from `quality-gate`
- added structured correlation logging helper
- added event query API with filtering, pagination, and aggregates
- integrated quality evidence remediation in transition guards
- added unit/integration coverage for new behavior

---

## Context

This task consolidates quality-gate functionality into `extensions/product-team`
and adds observability tooling.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Consolidate quality execution/parsers into product-team | Keep workflow state and quality evidence in one plugin |
| Add correlation-aware logging helper | Provide structured JSON logs with traceability |
| Keep `workflow.events.query` read-only | Preserve event log immutability and prevent side effects |
| Merge quality metadata by subtree overwrite | Keep optimistic locking while preserving unrelated task metadata |

---

## Implementation Notes

### Approach

- Reused proven modules from `extensions/quality-gate/src` into product-team
  (`exec`, `quality/parsers`, `quality/complexity`, `quality/gate`).
- Added product-team-specific adapters for task metadata updates, event logging,
  tool schema wiring, and OpenClaw tool execution contracts.
- Extended existing persistence and orchestration layers instead of creating
  parallel services.

### Key Changes

1. Dependencies:
   - Updated `extensions/product-team/package.json` with `fast-glob`,
     `picomatch`, `ts-morph`, `typhonjs-escomplex`.
2. Quality internals:
   - Added `src/exec/spawn.ts`, `src/quality/**`, and module typings in
     `src/types/external-modules.d.ts`.
3. Correlated logging:
   - Added `src/logging/correlated-logger.ts` with required JSON log fields.
4. Tool schemas:
   - Added `src/schemas/quality-*.schema.ts` plus
     `src/schemas/workflow-events-query.schema.ts`.
5. Tool implementations:
   - Added `src/tools/quality-*.ts`, `src/tools/workflow-events-query.ts`,
     `src/tools/quality-metadata.ts`, and shared helper
     `src/tools/quality-tool-common.ts`.
6. Event querying and quality event logging:
   - Extended `src/persistence/event-repository.ts` with `queryEvents(filters)`.
   - Extended `src/orchestrator/event-log.ts` with `logQualityEvent(...)`.
7. Transition guard quality evidence helper:
   - Updated `src/orchestrator/transition-guards.ts` to export
     `getMissingQualityEvidence(...)` with explicit remediation guidance.
8. Tool registration/integration:
   - Updated `src/tools/index.ts` and `src/index.ts` to register/publish all new
     tools and pass logger/workspace dependencies.
9. Test suite updates:
   - Added parser/complexity/policy/logger/tool/integration tests.
   - Updated existing registry/guard/persistence tests for new behavior.

---

## Commands Run

```bash
git checkout main
git pull origin main
git checkout -b feat/0006-quality-observability
pnpm install
pnpm --filter @openclaw/plugin-product-team test
pnpm --filter @openclaw/plugin-product-team lint
pnpm --filter @openclaw/plugin-product-team typecheck
pnpm --filter @openclaw/plugin-product-team test:coverage
pnpm --filter @openclaw/quality-gate test
pnpm --filter @openclaw/quality-gate lint
pnpm --filter @openclaw/quality-gate typecheck
pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/package.json` | Modified | Added quality dependencies |
| `extensions/product-team/src/exec/spawn.ts` | Added | Safe process execution utilities |
| `extensions/product-team/src/logging/correlated-logger.ts` | Added | Structured correlation logger |
| `extensions/product-team/src/quality/**` | Added | Parsers, complexity analyzers, gate policy/sources/types, fs helpers |
| `extensions/product-team/src/schemas/quality-*.schema.ts` | Added | Tool parameter schemas for quality tools |
| `extensions/product-team/src/schemas/workflow-events-query.schema.ts` | Added | Event query tool schema |
| `extensions/product-team/src/tools/quality-*.ts` | Added | Quality tools implementations |
| `extensions/product-team/src/tools/workflow-events-query.ts` | Added | Event log query tool |
| `extensions/product-team/src/tools/quality-metadata.ts` | Added | Deterministic quality metadata merge helper |
| `extensions/product-team/src/tools/index.ts` | Modified | Registered new tools and extended deps |
| `extensions/product-team/src/persistence/event-repository.ts` | Modified | Added queryEvents with aggregates |
| `extensions/product-team/src/orchestrator/event-log.ts` | Modified | Added quality event logging and event query passthrough |
| `extensions/product-team/src/orchestrator/transition-guards.ts` | Modified | Added `getMissingQualityEvidence` and remediation strings |
| `extensions/product-team/src/index.ts` | Modified | Passed workspace/logger deps and updated startup log |
| `extensions/product-team/test/**` | Added/Modified | New quality/logger/integration tests and updated affected tests |
| `pnpm-lock.yaml` | Modified | Lockfile updates for new dependencies |
| `docs/roadmap.md` | Modified | Marked task 0006 `IN_PROGRESS` during execution |
| `docs/walkthroughs/0006-quality-observability.md` | Added/Modified | Implementation journal |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| `@openclaw/plugin-product-team` | 283 | 283 | Statements 87.47%, Branches 79.83%, Functions 94.44%, Lines 87.47% |
| `@openclaw/quality-gate` | 135 (3 skipped) | 132 | N/A |
| Workspace (`pnpm test`) | Product-team + quality-gate suites | Pass | N/A |
| Workspace lint/typecheck | N/A | Pass | N/A |

---

## Follow-ups

- No required follow-ups for EP05 scope.

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
