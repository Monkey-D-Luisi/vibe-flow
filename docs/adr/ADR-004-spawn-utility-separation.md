# ADR-004: Separate spawn utilities for GitHub operations and general quality tooling

## Status
Accepted

## Date
2026-02-27

## Context

The product-team plugin invokes external processes in two distinct contexts:

1. **GitHub CLI operations** (`gh pr create`, `gh pr view`, `gh label create`,
   etc.) executed by the GitHub integration module (`src/github/`).
2. **Quality tool processes** (test runners, linters, coverage reporters)
   executed by the quality tools (`src/tools/quality-*.ts`) via the shared
   `@openclaw/quality-contracts/exec/spawn` module.

Both contexts require spawning child processes with a sanitised environment
(no secret leakage) and protection against shell-injection attacks. However,
the security surface differs:

- GitHub operations must **only ever call `gh`**. Any deviation — invoking
  `git`, `curl`, `bash`, or another tool through the GitHub module — would
  bypass the intent of the GitHub integration layer and could be exploited if
  attacker-controlled data reached the `cmd` parameter.
- Quality tool operations call a broader set of programs (`npx vitest`,
  `eslint`, `tsx`, etc.) configured by the workspace, not hard-coded to a
  single binary.

A single shared `safeSpawn` with a configurable allowlist would still require
callers to pass the correct allowlist. Enforcement would be by convention, not
by construction.

## Decision

Maintain **two separate spawn utilities**:

1. **`extensions/product-team/src/github/spawn.ts`** — GitHub-specific utility
   that hard-codes `ALLOWED_COMMAND_PREFIXES = ['gh']`. Any attempt to invoke
   a command that is not `gh` raises `UNSAFE_COMMAND`. This file is the only
   spawn entry-point for the `src/github/` module.

2. **`@openclaw/quality-contracts/exec/spawn`** — General-purpose
   `safeSpawn` used by quality tools and the quality-gate CLI. It sanitises
   shell metacharacters from all arguments but does not restrict the command
   name, because the set of quality-tool binaries is open-ended and
   workspace-specific.

Both utilities:
- Strip the process environment to a minimal allow-list (PATH, auth tokens,
  platform-specific keys).
- Reject shell metacharacters in every argument.
- Cap stdout/stderr buffers at 1 MB.
- Enforce a configurable timeout with abort-signal teardown.

## Alternatives Considered

### Single shared `safeSpawn` with an optional allowlist parameter

- **Pros:** One implementation to maintain.
- **Cons:** The GitHub module would have to pass `['gh']` on every call site.
  A future developer adding a new GitHub helper might forget the argument and
  silently get an unrestricted spawn. The security property becomes a
  convention rather than a structural guarantee.

### Wrap the shared `safeSpawn` inside `github/spawn.ts`

- **Pros:** Reuses the environment-sanitisation logic from contracts.
- **Cons:** The shared `safeSpawn` does not perform command-prefix validation,
  so the wrapper would still need to duplicate that check. Net result is the
  same code in two places. The current approach duplicates the spawn
  implementation but keeps each usage site fully self-contained and auditable.

### Use `child_process.exec` with a shell for all operations

- **Pros:** Simpler API.
- **Cons:** `exec` spawns a shell, making it trivially vulnerable to
  shell-injection if any argument is user-controlled. Rejected from the start.

## Consequences

### Positive

- **Structural enforcement for GitHub operations.** The `gh`-only allowlist
  in `github/spawn.ts` is enforced unconditionally by construction. Code
  review can verify the security property by inspecting one constant.
- **Clarity of intent.** Readers of `src/github/` know immediately that every
  process invocation goes through `gh`. Readers of quality tools know they
  use the contracts-level spawn.
- **Independent evolution.** If the GitHub CLI adds a new sub-command pattern
  requiring a different binary (e.g. a future `openclaw-cli`), the
  GitHub-specific allowlist can be updated without touching the general spawn.

### Negative

- **Duplicated implementation.** Environment sanitisation, buffer capping, and
  timeout logic are implemented twice (in `github/spawn.ts` and in
  `@openclaw/quality-contracts/exec/spawn`). Any fix to one does not
  automatically apply to the other.
- **Maintenance burden.** Two files to update when the base spawn contract
  changes (e.g. new required env keys, adjusted timeout behaviour).

### Neutral

- **Test coverage.** Both utilities are independently tested:
  `test/github/spawn.test.ts` and the contracts-package tests. Duplication is
  reflected in the test suite.

## References

- `extensions/product-team/src/github/spawn.ts`
- `packages/quality-contracts/src/exec/spawn.ts`
- `extensions/product-team/test/github/spawn.test.ts`
- [Task 0026: Consolidate exec/spawn and fs Utilities to Shared Contracts](../tasks/0026-consolidate-exec-and-fs-utilities-to-shared-contracts.md)
- [Roadmap EP06 — Hardening](../backlog/EP06-hardening.md)
