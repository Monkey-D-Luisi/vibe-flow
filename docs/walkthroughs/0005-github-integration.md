# Walkthrough: 0005 -- GitHub Integration

## Task Reference

- Task: `docs/tasks/0005-github-integration.md`
- Epic: EP04 -- GitHub Integration
- Branch: `feat/0005-github-integration`
- PR: <PR URL when created>

---

## Summary

Implemented EP04 GitHub automation in `@openclaw/plugin-product-team` with:
- safe `gh` execution wrapper (`safeSpawn` pattern, 30s timeout, 1MB output cap),
- idempotent request tracking via new SQLite table `ext_requests`,
- service layer for branch creation, PR create/update, and label sync,
- four new VCS tools (`vcs.branch.create`, `vcs.pr.create`, `vcs.pr.update`, `vcs.label.sync`),
- event logging for all VCS operations (`event_type: vcs.*`),
- schema validation and comprehensive tests for repositories, services, clients, schemas, and tools.

---

## Context

Before this task, the product-team plugin exposed only task/workflow tools and had
no GitHub integration layer. EP04 required idempotent VCS automation through `gh`
without introducing token persistence or unsafe shell execution.

The walkthrough file did not exist at task start and was created before implementation.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Add migration v2 with `ext_requests` (`UNIQUE(tool, payload_hash)`) | Provides deterministic idempotency for VCS operations |
| Implement local `src/github/spawn.ts` (safeSpawn pattern) | Reuses quality-gate execution model while keeping plugin package independent |
| Build dedicated service layer (`BranchService`, `PrService`, `LabelService`) | Keeps tools thin and centralizes validation + idempotency + event logging |
| Auto-generate PR body from task metadata when body is omitted | Satisfies AC for task-driven PR templates and keeps PR creation ergonomic |
| Keep `ToolDeps.vcs` optional but initialized in plugin register | Preserves compatibility with existing tests while enabling new tools |
| Require `taskId` in `vcs.pr.update` schema | Ensures `event_log.task_id` FK integrity for all VCS events |

---

## Implementation Notes

### Approach

TDD cycle followed:

1. Red
- Added failing tests for migration v2, request repository behavior, idempotency cache path, `gh` client behavior, and each new VCS tool.

2. Green
- Implemented persistence, GitHub wrapper, service layer, schemas, tool defs, and plugin wiring.
- Updated existing registration and migration tests to match new EP04 behavior.

3. Refactor
- Consolidated validation helpers and structured VCS error handling.
- Kept tool handlers focused on validation, task existence checks, and service orchestration.

### Key Changes

- Persistence
  - `src/persistence/migrations.ts`: added migration v2 for `ext_requests`.
  - `src/persistence/request-repository.ts`: added lookup/insert APIs for idempotency records.

- GitHub layer
  - `src/github/spawn.ts`: safe command validation + bounded process execution.
  - `src/github/gh-client.ts`: typed `gh` wrapper for branch/PR/label operations.
  - `src/github/idempotency.ts`: stable payload hashing + cache-first execution.
  - `src/github/branch-service.ts`: branch naming convention + idempotent branch creation.
  - `src/github/pr-service.ts`: PR create/update + cached branch resolution.
  - `src/github/label-service.ts`: idempotent label synchronization.
  - `src/github/validation.ts`, `src/github/pr-template.ts`: validation and PR body generation.

- Tooling and registration
  - Added schemas: `vcs-branch-create`, `vcs-pr-create`, `vcs-pr-update`, `vcs-label-sync`.
  - Added tools: `vcs.branch.create`, `vcs.pr.create`, `vcs.pr.update`, `vcs.label.sync`.
  - Updated `src/tools/index.ts` and `src/index.ts` to register and wire VCS dependencies.
  - Extended `EventLog` with `logVcsEvent(...)`.
  - Updated `openclaw.json` infra allow-list to dotted VCS tool names and relevant read tools.

---

## Commands Run

```bash
# Key commands executed during implementation
git checkout main
git pull origin main
git checkout -b feat/0005-github-integration

pnpm --filter @openclaw/plugin-product-team test
pnpm --filter @openclaw/plugin-product-team lint
pnpm --filter @openclaw/plugin-product-team typecheck
pnpm --filter @openclaw/plugin-product-team test:coverage

pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/persistence/migrations.ts` | Modified | Added migration v2 for `ext_requests` |
| `extensions/product-team/src/persistence/request-repository.ts` | Created | Added idempotency repository |
| `extensions/product-team/src/github/spawn.ts` | Created | Added safe process execution utilities for `gh` |
| `extensions/product-team/src/github/gh-client.ts` | Created | Added typed GitHub CLI wrapper |
| `extensions/product-team/src/github/idempotency.ts` | Created | Added payload hashing + idempotent executor |
| `extensions/product-team/src/github/branch-service.ts` | Created | Added branch orchestration service |
| `extensions/product-team/src/github/pr-service.ts` | Created | Added PR orchestration service |
| `extensions/product-team/src/github/label-service.ts` | Created | Added label sync service |
| `extensions/product-team/src/github/validation.ts` | Created | Added VCS validation helpers |
| `extensions/product-team/src/github/pr-template.ts` | Created | Added task-aware PR body template generator |
| `extensions/product-team/src/orchestrator/event-log.ts` | Modified | Added generic `logVcsEvent` method |
| `extensions/product-team/src/schemas/vcs-branch-create.schema.ts` | Created | Added branch tool schema |
| `extensions/product-team/src/schemas/vcs-pr-create.schema.ts` | Created | Added PR create schema |
| `extensions/product-team/src/schemas/vcs-pr-update.schema.ts` | Created | Added PR update schema |
| `extensions/product-team/src/schemas/vcs-label-sync.schema.ts` | Created | Added label sync schema |
| `extensions/product-team/src/tools/vcs-branch-create.ts` | Created | Added branch tool definition |
| `extensions/product-team/src/tools/vcs-pr-create.ts` | Created | Added PR create tool definition |
| `extensions/product-team/src/tools/vcs-pr-update.ts` | Created | Added PR update tool definition |
| `extensions/product-team/src/tools/vcs-label-sync.ts` | Created | Added label sync tool definition |
| `extensions/product-team/src/tools/vcs-errors.ts` | Created | Added structured VCS error mapping |
| `extensions/product-team/src/tools/index.ts` | Modified | Registered new VCS tools and deps |
| `extensions/product-team/src/index.ts` | Modified | Wired GitHub config, services, and request repo |
| `extensions/product-team/test/persistence/connection.test.ts` | Modified | Updated migration assertions for v2 |
| `extensions/product-team/test/persistence/request-repository.test.ts` | Created | Added request repository tests |
| `extensions/product-team/test/github/idempotency.test.ts` | Created | Added idempotency unit tests |
| `extensions/product-team/test/github/gh-client.test.ts` | Created | Added gh client tests |
| `extensions/product-team/test/github/branch-service.test.ts` | Created | Added branch service tests |
| `extensions/product-team/test/github/pr-service.test.ts` | Created | Added PR service tests |
| `extensions/product-team/test/github/label-service.test.ts` | Created | Added label service tests |
| `extensions/product-team/test/github/spawn.test.ts` | Created | Added spawn helper tests |
| `extensions/product-team/test/github/pr-template.test.ts` | Created | Added PR template tests |
| `extensions/product-team/test/github/validation.test.ts` | Created | Added validation helper tests |
| `extensions/product-team/test/schemas/vcs.schema.test.ts` | Created | Added VCS schema tests |
| `extensions/product-team/test/tools/vcs-branch-create.test.ts` | Created | Added branch tool tests |
| `extensions/product-team/test/tools/vcs-pr-create.test.ts` | Created | Added PR create tool tests |
| `extensions/product-team/test/tools/vcs-pr-update.test.ts` | Created | Added PR update tool tests |
| `extensions/product-team/test/tools/vcs-label-sync.test.ts` | Created | Added label sync tool tests |
| `extensions/product-team/test/index.test.ts` | Modified | Updated tool registration expectations |
| `openclaw.json` | Modified | Updated infra allow-list to dotted VCS tools |
| `docs/roadmap.md` | Modified | Task status transitions (`IN_PROGRESS` -> `DONE`) |
| `docs/tasks/0005-github-integration.md` | Modified | Updated task status + DoD only |
| `docs/walkthroughs/0005-github-integration.md` | Created/Modified | Full implementation walkthrough |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| Product-team (`vitest run`) | 209 | 209 | N/A |
| Product-team coverage (`vitest run --coverage`) | 209 | 209 | 94.16% statements / 87.73% branches / 98.13% functions |
| Workspace tests (`pnpm -r test`) | 344 | 341 passed, 3 skipped | N/A |
| Workspace quality gates | N/A | All pass | `pnpm lint` + `pnpm typecheck` pass |

---

## Follow-ups

- Consider replacing label update semantics from `--add-label` to full label reconciliation for PR updates (add/remove parity).
- Consider extending idempotency hash canonicalization for arrays where order should be semantically ignored beyond labels.

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
