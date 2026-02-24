# Walkthrough: CR-0162 Review Fixes

| Field   | Value                                      |
|---------|--------------------------------------------|
| PR      | #162                                       |
| Date    | 2026-02-24                                 |
| Tests   | 260 passed (132 quality-gate + 128 product-team), 3 skipped (Windows) |
| Lint    | clean                                      |
| Types   | clean                                      |

## Changes implemented

### 1. `parseCommand` — quote-aware tokeniser (`spawn.ts`)

Replaced the naive `command.split(/\s+/)` with a state-machine tokeniser that tracks `inSingle`/`inDouble` quote state. This correctly handles paths or arguments that contain spaces when wrapped in quotes (e.g., `eslint "./src/my file.ts"`). The old approach would split that into three tokens; the new approach yields one arg.

The `assertSafeCommand` `baseCmd` extraction was simplified from `cmd.split(/\s+/)[0]` to `cmd.toLowerCase()` — `cmd` is already the parsed executable from `parseCommand` so the split was redundant.

### 2. `SpawnResult` — surface truncation flags (`spawn.ts`)

Added `stdoutTruncated: boolean` and `stderrTruncated: boolean` to `SpawnResult`. All three resolve paths (normal close, AbortError, ENOENT) now include these fields.

### 3. Buffer byte comparison (`spawn.ts`)

Changed the truncation guard from `stdout.length > MAX_BUFFER_BYTES` (UTF-16 code units) to `Buffer.byteLength(stdout, 'utf8') > MAX_BUFFER_BYTES` so the 10 MB cap is enforced against actual UTF-8 byte count.

### 4. `process.once` + logged shutdown error (`product-team/src/index.ts`)

Changed `process.on` → `process.once` for `exit`, `SIGINT`, and `SIGTERM`. Using `once` prevents listener accumulation when `register()` is called multiple times (e.g., in tests) and makes `closeDb` effectively idempotent. The now-empty `catch` block was updated to log `api.logger.warn(...)` with the error message.

### 5. Remove `continue-on-error: true` (`ci.yml`)

The security audit step used `--audit-level=critical` which only fails on CRITICAL findings. The known transitive issues from the `openclaw` SDK are HIGH severity, so they will not break CI. Removing `continue-on-error` means future CRITICAL vulnerabilities will actually block merges.

### 6. Trailing comma in `glob.ts`

Added trailing comma after `followSymbolicLinks: false` for style consistency.

### 7. New tests in `spawn.test.ts`

- `assertSafeCommand — rejects commands not in the allowlist` (covers `rm`, `curl`, `bash`, `python`)
- `assertSafeCommand — allows allowlisted commands matched by path suffix` (covers `/usr/local/bin/pnpm`)
- `parseCommand` describe block (6 tests): simple split, no-args, double-quoted spaces, single-quoted spaces, quoted executable, multiple spaces
- `safeSpawn output truncation` describe block (2 tests): large stdout truncated, small output not truncated

## Skipped items

- **Allowlist prefix-only check (comment #9)** — Accepted as SUGGESTION/OUT_OF_SCOPE. The `SHELL_META` check blocks subcommand chaining with shell special chars. Full command-pattern enforcement is out of scope for this PR.
