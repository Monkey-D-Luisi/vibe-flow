# Walkthrough: 0010 -- Restore Root Quality-Gate Command Surface

## Task Reference

- Task: docs/tasks/0010-restore-root-quality-gate-command-surface.md
- Source Finding IDs: P-001
- Branch: feat/0010-restore-root-quality-gate-command-surface
- Status: DONE_VERIFIED

---

## Summary

Restored root-level `q:*` command surface by introducing explicit root scripts in
`package.json`, including a dedicated `q:gate` wrapper that accepts the
documented `--source artifacts` contract and delegates safely to the
`@openclaw/quality-gate` CLI.

Added a regression guard (`pnpm verify:q-surface`) plus CI enforcement so root
quality command drift fails fast.

Command failures related to findings P-002 and downstream artifact availability
were observed and documented as expected follow-up behavior, without scope drift.

---

## Execution Journal

### Implemented Approach

1. Add root scripts in package.json.
2. Add a root `q:gate` compatibility wrapper (`scripts/run-root-q-gate.ts`) to normalize `--source artifacts` and pass validated scope to delegated CLI.
3. Add and run command-contract verification command (`scripts/verify-root-quality-gate-command-surface.ts`).
4. Wire verification into CI (`.github/workflows/ci.yml`).

### Commands Run

~~~bash
pnpm verify:q-surface
# PASS - Root quality-gate command surface verified.

pnpm q:gate --source artifacts --scope minor
# EXECUTES from root through wrapper; exits 1 with gate verdict fail (missing tests metric), no missing-script error.

pnpm q:tests
# EXECUTES from root; exits 1 with known P-002 UNSAFE_COMMAND default behavior.

pnpm q:coverage
# EXECUTES from root; exits 1 with NOT_FOUND coverage artifacts (expected when no coverage artifacts generated).

pnpm q:lint
# EXECUTES from root; exits 1 with known P-002 UNSAFE_COMMAND default behavior.

pnpm q:complexity
# EXECUTES from root and writes report; exits 1 due complexity threshold exceeded.

pnpm test
# PASS

pnpm lint
# PASS

pnpm typecheck
# PASS
~~~

### Verification Evidence

| Check | Result | Evidence |
|------|--------|----------|
| AC1: `pnpm q:gate` available from root | PASS | `pnpm q:gate --source artifacts --scope minor` executes root script and delegated CLI; missing-script error removed |
| AC2: Root `q:*` scripts delegate correctly | PASS | `q:tests/q:coverage/q:lint/q:complexity` all execute delegated commands from root |
| AC3: Docs command references align with executable contract | PASS | Documented root commands (`pnpm q:gate --source artifacts --scope minor`, `pnpm q:*`) now exist in root scripts |
| AC4: Regression check added | PASS | `scripts/verify-root-quality-gate-command-surface.ts`, `pnpm verify:q-surface`, CI step added |
| Tests pass | PASS | `pnpm test` |
| Lint pass | PASS | `pnpm lint` |
| Typecheck pass | PASS | `pnpm typecheck` |

### Files Changed

- `package.json`
- `scripts/run-root-q-gate.ts`
- `scripts/verify-root-quality-gate-command-surface.ts`
- `.github/workflows/ci.yml`
- `docs/roadmap.md`
- `docs/tasks/0010-restore-root-quality-gate-command-surface.md`
- `docs/walkthroughs/0010-restore-root-quality-gate-command-surface.md`

---

## Closure Decision

- Current status: DONE_VERIFIED
- Closure criteria met: YES
- Notes:
  - Scope intentionally limited to restoring root command surface and regression protection.
  - Known failures in delegated `q:tests` / `q:lint` defaults remain tracked by task `0011` (P-002).

---

## Checklist

- [x] Source findings linked for traceability
- [x] Commands executed and recorded
- [x] Verification evidence attached
- [x] Closure decision updated to DONE_VERIFIED
