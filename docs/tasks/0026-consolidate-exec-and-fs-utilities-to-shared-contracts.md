# Task: 0026 -- Consolidate exec/spawn and fs Utilities to Shared Contracts

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation 2026-02-27 |
| Priority | MEDIUM |
| Scope | MAJOR |
| Created | 2026-02-27 |
| Branch | `feat/0026-consolidate-exec-fs-utilities-to-shared-contracts` |
| Source Finding | A-002, A-003 (audit 2026-02-27) |

---

## Goal

Eliminate the duplication of `exec/spawn.ts` and file system utilities between `extensions/product-team` and `extensions/quality-gate` by extracting them to `@openclaw/quality-contracts`, so security patches need to be applied in only one place.

---

## Context

Source findings: **A-003** (MEDIUM, highest priority) and **A-002** (MEDIUM).

**A-003**: `extensions/product-team/src/exec/spawn.ts` and `extensions/quality-gate/src/exec/spawn.ts` are 227-line files that are 99%+ identical. Both contain security-critical logic: `assertSafeCommand()`, `assertPathContained()`, `SHELL_META` regex, command allowlist, and `safeSpawn()`. Any future vulnerability fix must be applied twice, creating risk of divergence.

**A-002**: File system utilities — `resolveGlobPatterns()`, `readFileSafe()`, `readJsonFile<T>()`, `filterByExclude()` — are ~95% duplicated between `product-team/src/quality/fs.ts` and `quality-gate/src/fs/glob.ts` + `quality-gate/src/fs/read.ts`.

The `packages/quality-contracts/` package already provides shared parsers, gate policy, and complexity types to both extensions via workspace dependency. Extending it with exec and fs modules is architecturally consistent.

---

## Scope

### In Scope

- Create `packages/quality-contracts/src/exec/spawn.ts` with the consolidated spawn implementation
- Create `packages/quality-contracts/src/fs/glob.ts` and `packages/quality-contracts/src/fs/read.ts` with consolidated fs utilities
- Update both extensions to import from `@openclaw/quality-contracts` instead of local copies
- Remove the now-redundant local copies in both extensions
- Verify all tests pass after the migration

### Out of Scope

- Merging `github/spawn.ts` (intentionally separate GitHub-specific spawn — confirmed good architecture)
- Changes to the spawn security model (allowlist, SHELL_META, assertSafeCommand) — preserve exactly

---

## Requirements

1. The consolidated `exec/spawn.ts` in quality-contracts must be behaviorally identical to both existing implementations.
2. All imports in product-team and quality-gate that previously pointed to local spawn/fs must now point to `@openclaw/quality-contracts/exec/spawn.js` and `@openclaw/quality-contracts/fs/*.js`.
3. The local copies in both extensions must be deleted.
4. All existing tests for spawn and fs utilities must continue to pass unchanged.

---

## Acceptance Criteria

- [ ] AC1: `packages/quality-contracts/src/exec/spawn.ts` exists with `assertSafeCommand`, `assertPathContained`, `safeSpawn`, and all supporting types.
- [ ] AC2: `packages/quality-contracts/src/fs/` contains glob and read utilities.
- [ ] AC3: Neither `extensions/product-team/src/exec/spawn.ts` nor `extensions/quality-gate/src/exec/spawn.ts` exists.
- [ ] AC4: All existing spawn and fs tests pass.
- [ ] AC5: `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.

---

## Constraints

- ESM `.js` import extensions must be used throughout.
- Must not change the exported function signatures or type names (other extensions may depend on them).
- Migration must be atomic: both extensions updated in the same PR.

---

## Implementation Steps

1. Read both `exec/spawn.ts` files and `quality/fs.ts`, `fs/glob.ts`, `fs/read.ts` to confirm the content.
2. Create `packages/quality-contracts/src/exec/spawn.ts` — copy the canonical version, add exports.
3. Create `packages/quality-contracts/src/fs/glob.ts` and `packages/quality-contracts/src/fs/read.ts`.
4. Update `packages/quality-contracts/src/index.ts` (if it exists) or barrel exports.
5. Update product-team imports throughout `src/` from `../exec/spawn.js` to `@openclaw/quality-contracts/exec/spawn.js`.
6. Update quality-gate imports throughout `src/` from `../exec/spawn.js` / `../fs/glob.js` to shared path.
7. Delete the local copies.
8. Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Testing Plan

- Existing spawn tests in `quality-gate/test/spawn.test.ts` must pass unchanged.
- Existing fs utility tests (if any) must pass.
- Verify no import resolution errors via typecheck.

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Tests written and passing
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
- [ ] PR created and linked

---

## Finding Snapshot (Immutable)

| Field | Value |
|-------|-------|
| Source Finding IDs | A-002, A-003 |
| Axis | Architecture |
| Severity | MEDIUM |
| Confidence | HIGH |
| Evidence (A-003) | `product-team/src/exec/spawn.ts` and `quality-gate/src/exec/spawn.ts` — 227 lines, 99%+ identical, security-critical |
| Evidence (A-002) | `product-team/src/quality/fs.ts` vs `quality-gate/src/fs/glob.ts` + `read.ts` — ~40 LOC duplicated |
| Impact | Vulnerability patches must be applied in two places; divergence risk over time |
| Recommendation | Extract both to `@openclaw/quality-contracts/exec/spawn.ts` and `@openclaw/quality-contracts/fs/` |
