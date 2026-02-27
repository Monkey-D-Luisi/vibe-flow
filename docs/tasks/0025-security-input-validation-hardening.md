# Task: 0025 -- Security Input Validation Hardening

## Metadata

| Field | Value |
|-------|-------|
| Status | PENDING |
| Epic | Audit remediation 2026-02-27 |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-02-27 |
| Branch | `fix/0025-security-input-validation-hardening` |
| Source Finding | S-003, S-008 (audit 2026-02-27) |

---

## Goal

Harden two input validation gaps: (1) limit glob pattern length to prevent ReDoS via user-supplied exclude patterns, and (2) add file size limits before `JSON.parse()` to prevent DoS via large JSON files.

---

## Context

Source findings: **S-003** (picomatch ReDoS risk) and **S-008** (JSON parsing without size limits).

**S-003**: Both extensions use `picomatch@2.3.1` to filter files by user-supplied `--exclude` patterns (CLI and tool args). Adversarially crafted patterns with nested extglobs or repeated wildcards can cause catastrophic backtracking. Related: minimatch ReDoS CVEs (GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74) affect a similar library. Evidence: `quality-gate/src/fs/glob.ts:1`, `product-team/src/quality/fs.ts:67`, CLI `qcli.ts:95-98`.

**S-008**: `quality-gate/src/fs/read.ts:22` and `quality-gate/cli/qcli.ts:148` parse JSON files without checking file size first. A large crafted JSON file could cause memory exhaustion in the CLI or quality tools.

---

## Scope

### In Scope

- Add a maximum glob pattern length check (e.g., 500 chars) in `filterByExclude()` and any other picomatch usage point; throw a descriptive error for oversized patterns
- Add a maximum file size check before `JSON.parse()` in `quality-gate/src/fs/read.ts` and `quality-gate/cli/qcli.ts` history file parsing (recommended limit: 50 MB)
- Update picomatch to latest available version if a patch is available
- Add tests for both hardening measures

### Out of Scope

- Switching from picomatch to a different glob library
- Implementing rate limiting or circuit breakers

---

## Requirements

1. Any glob pattern exceeding `MAX_PATTERN_LENGTH` (500 chars) must be rejected with a clear error before picomatch is invoked.
2. Any JSON file exceeding `MAX_JSON_FILE_BYTES` (50 MB) must be rejected before `JSON.parse()` is called.
3. Both limits must be defined as named constants (not magic numbers).
4. Tests must cover: pattern at limit (accepted), pattern over limit (rejected), file at limit (accepted), file over limit (rejected).

---

## Acceptance Criteria

- [ ] AC1: Passing a pattern longer than 500 chars to the glob exclude logic throws `PATTERN_TOO_LONG` or similar error.
- [ ] AC2: Passing a JSON file larger than 50 MB to `readJsonFile()` or history parsing throws `FILE_TOO_LARGE` or similar error before parsing.
- [ ] AC3: Tests cover boundary conditions for both limits.
- [ ] AC4: `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass.

---

## Constraints

- Limits must be exported constants to enable testing and future configurability.
- Must not break existing valid patterns and files.

---

## Implementation Steps

1. Read `quality-gate/src/fs/glob.ts`, `quality-gate/src/fs/read.ts`, `product-team/src/quality/fs.ts`.
2. Add `MAX_PATTERN_LENGTH = 500` constant and pre-check in all picomatch call sites.
3. Add `MAX_JSON_FILE_BYTES = 50 * 1024 * 1024` constant and async `fs.promises.stat()` check before `JSON.parse()` in `readJsonFile()` and CLI history parsing (prefer async to avoid blocking the event loop).
4. Check picomatch latest version via `pnpm outdated | grep picomatch`; update if a patch is available.
5. Write unit tests for both hardening measures.
6. Run `pnpm test && pnpm lint && pnpm typecheck`.

---

## Testing Plan

- Unit: `glob.ts` — pattern at 500 chars passes, pattern at 501 chars throws
- Unit: `read.ts` — mock `fs.statSync` returning 50 MB passes, 50 MB + 1 byte throws
- Unit: CLI history parsing — same file size boundary

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
| Source Finding IDs | S-003, S-008 |
| Axis | Security |
| Severity | MEDIUM |
| Confidence | CERTAIN |
| Evidence (S-003) | `quality-gate/src/fs/glob.ts:1`, `product-team/src/quality/fs.ts:67`, `qcli.ts:95-98` — picomatch@2.3.1 processes user exclude patterns without length limit |
| Evidence (S-008) | `quality-gate/src/fs/read.ts:22`, `qcli.ts:148` — JSON.parse() called without file size check |
| Impact | Adversarial patterns could cause CPU exhaustion (S-003); large files could cause memory exhaustion (S-008) |
| Recommendation | Add pattern length limit; add file size limit before JSON.parse(); update picomatch if patched |
