# CR-0162: Review Fixes — Comprehensive Security/Architecture/Performance Audit

| Field     | Value                                                 |
|-----------|-------------------------------------------------------|
| PR        | #162                                                  |
| Status    | done                                                  |
| Severity  | MUST_FIX + SHOULD_FIX + NIT                          |

## MUST_FIX Items

1. **`parseCommand` naive split breaks quoted arguments** (Gemini HIGH) — Replace the `split(/\s+/)` implementation with a quote-aware state-machine tokeniser so paths or arguments containing spaces are parsed correctly.
2. **`process.on` accumulates duplicate listeners** (Copilot) — Replace `process.on('exit'|'SIGINT'|'SIGTERM')` with `process.once(...)` to prevent multiple registrations when `register()` is called in tests or hot-reload contexts.

## SHOULD_FIX Items

3. **`assertSafeCommand` redundant `baseCmd` split** — `cmd` is already the first token supplied by `parseCommand`; simplify extraction to `cmd.toLowerCase()`.
4. **Buffer truncation uses `string.length` instead of byte count** (Copilot) — Use `Buffer.byteLength(str, 'utf8')` for the size comparison so the cap is accurate for multi-byte (UTF-8) output.
5. **`stdoutTruncated`/`stderrTruncated` not surfaced** (Copilot) — Add fields to `SpawnResult` and populate them in all resolve paths so callers can distinguish parse failures from truncated output.
6. **Silent catch in `closeDb`** (Copilot) — Log the caught error via `api.logger.warn` instead of swallowing it silently.
7. **`continue-on-error: true` defeats security audit gate** (Copilot) — Remove the flag; `--audit-level=critical` already filters out the known HIGH transitive issues from `openclaw`, so the step will only fail on actual CRITICAL findings.
8. **No tests for allowlist rejection or output truncation** (Copilot) — Add focused tests in `spawn.test.ts`.

## NIT

9. **Missing trailing comma after `followSymbolicLinks: false`** (Copilot) — Style consistency fix.

## OUT_OF_SCOPE / SUGGESTION

10. **Allowlist checks prefix only, not full command pattern** (Copilot) — The existing `SHELL_META` validation already blocks subcommand injection (e.g., `pnpm dlx evil-pkg` would fail the metacharacter check if it contains shell special chars). Tightening to full-command patterns is over-engineering for the current scope.
