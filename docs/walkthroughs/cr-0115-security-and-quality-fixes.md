# Walkthrough: CR-0115 Security and Quality Fixes

## Task Reference
- Task: `docs/tasks/cr-0115-security-and-quality-fixes.md`
- Branch/PR: `feat/openclaw-extensions-restructure` / #115
- Date: 2026-02-23

## Summary
Code review of PR #115/#159 identified critical security vulnerabilities (command injection on Windows, path traversal) and quality issues. Two rounds of fixes were applied:

**Round 1 (cr-0115):** Initial security guards and template cleanup.
**Round 2 (Phase B/C from Copilot + Gemini review):** Hardened security helpers, fixed bare catch blocks, aligned config units, added security tests.

## Decisions & Trade-offs
- **Command validation approach:** `assertSafeCommand()` rejects shell metacharacters (including quotes, backslashes, newlines) and validates both command and arguments.
- **Path traversal protection:** `assertPathContained()` now uses `path.relative` instead of `startsWith` to prevent sibling-prefix bypass (e.g. `/root/dir2` vs `/root/dir`).
- **Error handling:** Bare catch blocks replaced — `loadSummary`/`loadLcov` now only swallow NOT_FOUND, re-throwing parse errors. Istanbul parser preserves error cause.
- **Config units:** `openclaw.plugin.json` defaults aligned to 70/80 (percentages), matching `DEFAULT_POLICIES` in `types.ts`.
- **CLI validation:** `--scope` now validated against `['major','minor','patch','default']`.

## Files Changed (Round 2)
- `extensions/quality-gate/src/exec/spawn.ts` -- Hardened SHELL_META regex, assertSafeCommand validates args, assertPathContained uses path.relative
- `extensions/quality-gate/src/tools/coverage_report.ts` -- Fixed bare catches (ENOENT-only), cwd resolved to absolute
- `extensions/quality-gate/src/tools/complexity.ts` -- Fixed bare catch, cwd resolved to absolute
- `extensions/quality-gate/src/gate/sources.ts` -- Fixed bare catch
- `extensions/quality-gate/src/parsers/istanbul.ts` -- Preserved error cause in catch
- `extensions/quality-gate/openclaw.plugin.json` -- Coverage defaults 0.70/0.80 → 70/80
- `extensions/quality-gate/cli/qcli.ts` -- Added --scope enum validation, updated usage
- `extensions/quality-gate/src/complexity/tsmorph.ts` -- Removed redundant BinaryExpression from DECISION_KINDS
- `extensions/quality-gate/test/spawn.test.ts` -- Added 12 tests for assertSafeCommand and assertPathContained

## Tests
- All 125 tests pass (123 passed + 2 skipped) (`pnpm test`)
- Lint clean (`pnpm lint`)
- Typecheck clean (`pnpm typecheck`)

## Follow-ups / Backlog
- [ ] Consider using AST-based complexity analysis in future iteration
- [ ] Add ESLint config to product-team extension
