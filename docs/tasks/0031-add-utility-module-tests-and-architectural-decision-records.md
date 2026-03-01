# Task: 0031 -- Add Utility Module Tests and Architectural Decision Records

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation 2026-02-27 |
| Priority | LOW |
| Scope | MINOR |
| Created | 2026-02-27 |
| Branch | `docs/0031-utility-tests-and-adrs` |
| Source Finding | D-003, D-009 (audit 2026-02-27) |

---

## Goal

Create test files for untested utility modules (`quality-metadata.ts`, `quality/fs.ts`) and write ADRs capturing rationale for key architectural decisions that currently lack documentation.

---

## Context

Source findings: **D-003** (LOW) and **D-009** (LOW).

**D-003**: `extensions/product-team/src/tools/quality-metadata.ts` (7 public metadata merging functions) and `extensions/product-team/src/quality/fs.ts` have no corresponding test files. These are utility modules with real logic that could regress silently.

**D-009**: Only `docs/adr/ADR-001.md` exists, covering the migration from MCP. Key architectural decisions without recorded rationale include:
- Why SQLite (`better-sqlite3`) for persistence instead of in-memory or other databases
- Why `exec/spawn.ts` is separate from `github/spawn.ts` (security boundaries)
- Why `quality-gate` is a separate extension rather than integrated into `product-team`
- Why the task state machine uses a lease model for concurrency

---

## Scope

### In Scope

- Create `extensions/product-team/test/tools/quality-metadata.test.ts` covering all 7 public functions
- Create `extensions/product-team/test/quality/fs.test.ts` covering glob and read utility functions
- Write `docs/adr/ADR-002-sqlite-persistence.md`
- Write `docs/adr/ADR-003-separate-quality-gate-extension.md`
- Write `docs/adr/ADR-004-spawn-utility-separation.md`

### Out of Scope

- Writing ADRs for future decisions
- Changes to the implementations being documented/tested

---

## Requirements

1. Test files must cover all exported functions in `quality-metadata.ts` with at least one test per function.
2. Test files must cover the main paths in `quality/fs.ts` (glob resolution, safe read, JSON read).
3. Each ADR must follow the existing ADR template format.
4. ADRs must accurately reflect the current implementation state.

---

## Acceptance Criteria

- [x] AC1: `test/tools/quality-metadata.test.ts` exists with ≥ 7 test cases (one per exported function).
- [x] AC2: `test/quality/fs.test.ts` exists with ≥ 5 test cases.
- [x] AC3: `docs/adr/ADR-002-sqlite-persistence.md`, `ADR-003-separate-quality-gate-extension.md`, and `ADR-004-spawn-utility-separation.md` exist and follow the template.
- [x] AC4: `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.

---

## Constraints

- ADR content must be based on current observable implementation, not speculation.
- Test files must mock filesystem and database calls where appropriate (no integration dependencies).

---

## Implementation Steps

1. Read `src/tools/quality-metadata.ts` to enumerate all exported functions.
2. Create `test/tools/quality-metadata.test.ts` with unit tests for each function.
3. Read `src/quality/fs.ts` to enumerate exported functions.
4. Create `test/quality/fs.test.ts` with unit tests; mock `fast-glob` and `fs` modules.
5. Read `docs/adr/ADR-001.md` to understand the ADR template format.
6. Write ADR-002, ADR-003, ADR-004 using the template.
7. Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Testing Plan

- Unit: quality-metadata functions with representative metadata objects
- Unit: fs utilities with mocked glob and filesystem
- No integration tests needed (pure logic)

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] 3 ADRs created
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] PR created and linked

---

## Finding Snapshot (Immutable)

| Field | Value |
|-------|-------|
| Source Finding IDs | D-003, D-009 |
| Axis | Development |
| Severity | LOW |
| Confidence | HIGH / MEDIUM |
| Evidence (D-003) | `product-team/src/tools/quality-metadata.ts`, `product-team/src/quality/fs.ts` — no test files; 0% coverage |
| Evidence (D-009) | `docs/adr/` — only ADR-001; no rationale for SQLite, spawn split, quality-gate separation |
| Impact | Utility regression goes undetected; new contributors lack architectural context |
| Recommendation | Create test files for utility modules; write ADRs for major architectural decisions |
