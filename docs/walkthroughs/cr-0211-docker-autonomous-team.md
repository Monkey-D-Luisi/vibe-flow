# Walkthrough: CR-0211 — Docker Autonomous Team Code Review

## What changed

Applied fixes from independent code review + GitHub bot comments on PR #211.

## Changes

### 1. Dockerfile: reproducible builds + correct rebuild command
- `--no-frozen-lockfile` → `--frozen-lockfile`
- `npm rebuild better-sqlite3` → `pnpm rebuild better-sqlite3`

### 2. docker-entrypoint.sh: mask gateway token in logs
- Dashboard URL now shows only first 8 chars of token + `...` instead of full value.

### 3. quality-gate lint.ts + run_tests.ts: input validation
- Added `assertOptionalString`, `assertOptionalStringEnum`, `assertOptionalNumber` guards to execute handlers, matching the pattern in complexity.ts.

### 4. spawn.ts: Windows `%` env expansion bypass
- Added `%` to `SHELL_META` regex to prevent `%VAR%` expansion through `cmd.exe`.

### 5. team-ui handlers: honest error responses
- `handleAgentsUpdate` and `handleConfigUpdate` now respond with `{ error: 'not_implemented' }` instead of faking success.

### 6. CI coverage filter: renamed package
- `@openclaw/plugin-product-team` → `@openclaw/product-team`.

### 7. CLAUDE.md: tool name alignment
- Updated registered tools table from dot notation (`task.create`) to underscore notation (`task_create`) matching actual registration.

### 8. Shared ensureMessagesTable: extracted from duplicates
- Created `extensions/product-team/src/tools/shared-db.ts` with canonical `ensureMessagesTable`.
- Both `team-messaging.ts` and `decision-engine.ts` import from shared module.

## Risk assessment
Low. All changes are defensive (validation, honest errors, documentation alignment). No behavioral changes to happy paths.
