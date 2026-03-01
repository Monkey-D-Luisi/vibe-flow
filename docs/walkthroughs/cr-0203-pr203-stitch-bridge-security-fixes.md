# Walkthrough CR-0203: PR #203 Stitch Bridge Security Fixes

## Findings addressed
11 findings from Gemini Code Assist and Copilot review of PR #203.

## Changes made

### extensions/stitch-bridge/src/index.ts
- F1–F3: Added `basename(screenName)` sanitization and empty-name guard in design.generate, design.edit, design.get
- F5: Replaced bare `catch` in design.list with ENOENT guard; unexpected errors are logged then rethrown
- F6: Replaced `String(result?.html ?? result)` fallback with explicit type check — throws `Error('Stitch MCP response missing html field')` if html is absent or not a string

### extensions/stitch-bridge/src/stitch-client.ts
- F9: JSON-RPC ID now uses `stitch-${Date.now()}-${Math.random().toString(36).slice(2)}` for uniqueness

### extensions/stitch-bridge/test/tools/design-edit.test.ts (new)
- F7: 3 tests — saves HTML, sanitizes screenName, propagates errors

### extensions/stitch-bridge/test/tools/design-get.test.ts (new)
- F7: 3 tests — reads file using safe screenName, propagates readFile errors, path traversal blocked

### extensions/stitch-bridge/test/tools/design-list.test.ts (new)
- F7: 4 tests — returns empty on ENOENT, lists .html files, rethrows non-ENOENT errors, filters non-html files

### extensions/stitch-bridge/ (boilerplate committed)
- F4: Staged and committed package.json, tsconfig.json, openclaw.plugin.json, vitest.config.ts, .eslintrc.cjs

### docs/tasks/0039-stitch-mcp-bridge.md
- F8: Unchecked AC items for per-agent access control; added note "deferred — enforced at platform layer (Task 0040)"
- F10: Fixed `tests/` → `test/` in D1 directory tree

### extensions/stitch-bridge/tests/ (removed)
- F11: Deleted empty directory

## Test results
- All existing 12 tests continue to pass
- 10 new tests added (design-edit: 3, design-get: 3, design-list: 4)
