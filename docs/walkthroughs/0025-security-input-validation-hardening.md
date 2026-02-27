# Walkthrough: 0025 -- Security Input Validation Hardening

## Task Reference

- Task: `docs/tasks/0025-security-input-validation-hardening.md`
- Epic: Audit remediation 2026-02-27
- Branch: `fix/0025-security-input-validation-hardening`
- PR: [#187](https://github.com/Monkey-D-Luisi/vibe-flow/pull/187)

---

## Summary

Added two security hardening guards across both extensions:

1. **Pattern length limit (S-003)**: Any glob exclude pattern longer than
   `MAX_PATTERN_LENGTH` (500 chars) now throws `PATTERN_TOO_LONG` before
   picomatch is invoked, preventing catastrophic ReDoS backtracking.

2. **JSON file size limit (S-008)**: Any JSON file larger than
   `MAX_JSON_FILE_BYTES` (50 MB) now throws `FILE_TOO_LARGE` before
   `JSON.parse()` is called, preventing memory exhaustion.

---

## Context

Source findings S-003 (picomatch ReDoS risk) and S-008 (JSON parsing without
size limits) from the 2026-02-27 full audit.

At task start:
- `filterByExclude()` in `product-team/src/quality/fs.ts` called
  `picomatch(pattern)(path)` with no pattern length check.
- `resolveGlobPatterns()` in both extensions passed `exclude` patterns to
  fast-glob/picomatch without length validation.
- `readJsonFile()` in both extensions called `JSON.parse()` without checking
  file size first.
- `readHistoryFile()` in `quality-gate/cli/qcli.ts` used sync `readFileSync`
  with no size check.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| `MAX_PATTERN_LENGTH = 500` | Task spec requirement; generous limit for real-world glob patterns |
| `MAX_JSON_FILE_BYTES = 50 * 1024 * 1024` | Task spec requirement; covers all realistic quality report files |
| Constants exported | AC requirement — enables testing and future configurability |
| `fs.promises.stat()` before `JSON.parse()` | Task spec prefers async to avoid blocking the event loop |
| Convert `readHistoryFile` to async | Required to use `fs.promises.stat()`; `parseGateArgs` made async in turn |
| Guard in both `filterByExclude` and `resolveGlobPatterns` | Both are picomatch call sites; coverage for CLI exclude patterns and tool API patterns |

---

## Implementation Notes

### Files modified

- `extensions/product-team/src/quality/fs.ts`
  - Added `MAX_PATTERN_LENGTH = 500` and `MAX_JSON_FILE_BYTES` exports
  - Added pattern length guard in `filterByExclude()` (throws `PATTERN_TOO_LONG`)
  - Added pattern length guard in `resolveGlobPatterns()` exclude loop
  - Added `fs.promises.stat()` size check in `readJsonFile()` (throws `FILE_TOO_LARGE`)

- `extensions/quality-gate/src/fs/read.ts`
  - Added `MAX_JSON_FILE_BYTES = 50 * 1024 * 1024` export
  - Added `fs.promises.stat()` size check in `readJsonFile()` (throws `FILE_TOO_LARGE`)

- `extensions/quality-gate/src/fs/glob.ts`
  - Added `MAX_PATTERN_LENGTH = 500` export
  - Added pattern length guard in `resolveGlobPatterns()` exclude loop (throws `PATTERN_TOO_LONG`)

- `extensions/quality-gate/cli/qcli.ts`
  - Replaced `readFileSync` import with async `stat` + `readFile` from `node:fs/promises`
  - Imported `MAX_JSON_FILE_BYTES` from `../src/fs/read.js`
  - Converted `readHistoryFile()` to `async` with `stat()` size check
  - Made `parseGateArgs()` async to `await readHistoryFile()`
  - Updated `main()` to `await parseGateArgs()`

### Files created

- `extensions/quality-gate/test/fs.read.test.ts` — 5 tests for `readJsonFile` size guard
- `extensions/quality-gate/test/fs.glob.test.ts` — 5 tests for `resolveGlobPatterns` pattern guard
- `extensions/product-team/test/quality/fs.test.ts` — 12 tests covering both guards in product-team

---

## Commands Run

```bash
pnpm test       # PASS: 155 (quality-gate) + 393 (product-team) tests
pnpm lint       # PASS: zero errors
pnpm typecheck  # PASS: zero errors
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/quality/fs.ts` | Modified | Added MAX_PATTERN_LENGTH, MAX_JSON_FILE_BYTES, guards in filterByExclude, resolveGlobPatterns, readJsonFile |
| `extensions/quality-gate/src/fs/read.ts` | Modified | Added MAX_JSON_FILE_BYTES, stat() size check in readJsonFile |
| `extensions/quality-gate/src/fs/glob.ts` | Modified | Added MAX_PATTERN_LENGTH, pattern length guard in resolveGlobPatterns |
| `extensions/quality-gate/cli/qcli.ts` | Modified | Converted readHistoryFile to async with stat size check; parseGateArgs made async |
| `extensions/quality-gate/test/fs.read.test.ts` | Created | Unit tests for readJsonFile size guard |
| `extensions/quality-gate/test/fs.glob.test.ts` | Created | Unit tests for resolveGlobPatterns pattern guard |
| `extensions/product-team/test/quality/fs.test.ts` | Created | Unit tests for both guards in product-team |

---

## Tests

| Suite | Tests | Passed | Notes |
|-------|-------|--------|-------|
| quality-gate | 155 | 155 | +10 new tests (fs.read + fs.glob) |
| product-team | 393 | 393 | +12 new tests (quality/fs) |

---

## Verification Evidence

- AC1: `filterByExclude([501-char pattern])` throws `PATTERN_TOO_LONG`; `resolveGlobPatterns([501-char exclude])` throws `PATTERN_TOO_LONG`
- AC2: `readJsonFile` with `stat.size > MAX_JSON_FILE_BYTES` throws `FILE_TOO_LARGE` before `JSON.parse()`; `readHistoryFile` in qcli does the same
- AC3: Tests cover boundary conditions (exactly at limit → pass; one over → throw) for both limits in both extensions
- AC4: `pnpm test && pnpm lint && pnpm typecheck` — all pass

---

## Checklist

- [x] Task spec read end-to-end
- [x] AC1: PATTERN_TOO_LONG guard in filterByExclude and resolveGlobPatterns
- [x] AC2: FILE_TOO_LARGE guard in readJsonFile and readHistoryFile
- [x] AC3: Boundary tests for both limits in both extensions
- [x] AC4: Quality gates passed
- [x] Files changed section complete
