# CR-0203: PR #203 Stitch Bridge Security Fixes

| Field        | Value                                                                            |
|--------------|----------------------------------------------------------------------------------|
| Task         | CR-0203                                                                          |
| PR           | #203 feat(stitch-bridge): Stitch MCP bridge plugin with retry logic and tests    |
| Status       | DONE                                                                             |

## Findings

| ID  | File                                                       | Finding                                                                                        | Severity   | Source           |
|-----|------------------------------------------------------------|------------------------------------------------------------------------------------------------|------------|------------------|
| F1  | `extensions/stitch-bridge/src/index.ts:71`                 | Path traversal: `screenName` used unsanitized in `join()` — design.generate                   | MUST_FIX   | Gemini + Copilot |
| F2  | `extensions/stitch-bridge/src/index.ts:118`                | Path traversal: `screenName` used unsanitized in `join()` — design.edit                       | MUST_FIX   | Gemini + Copilot |
| F3  | `extensions/stitch-bridge/src/index.ts:146`                | Path traversal: `screenName` used unsanitized in `join()` — design.get                        | MUST_FIX   | Gemini + Copilot |
| F4  | `extensions/stitch-bridge/`                                | Boilerplate files (package.json, tsconfig.json, openclaw.plugin.json, vitest.config.ts, .eslintrc.cjs) exist locally but not committed | MUST_FIX   | Copilot          |
| F5  | `extensions/stitch-bridge/src/index.ts:173`                | Bare catch in design.list swallows non-ENOENT errors without logging                          | SHOULD_FIX | Gemini + Copilot |
| F6  | `extensions/stitch-bridge/src/index.ts:68,115`             | HTML extraction falls back to `String(result)` → `'[object Object]'` silently                 | SHOULD_FIX | Gemini           |
| F7  | `extensions/stitch-bridge/src/index.ts`                    | No tests for design.edit, design.get, or design.list                                          | SHOULD_FIX | Copilot          |
| F8  | `docs/tasks/0039-stitch-mcp-bridge.md:118-119`             | AC items [x] claim per-agent access control is implemented — it is not                        | SHOULD_FIX | Copilot          |
| F9  | `extensions/stitch-bridge/src/stitch-client.ts:64`         | JSON-RPC ID uses `Date.now()` only — not unique under concurrent calls                        | NIT        | Gemini           |
| F10 | `docs/tasks/0039-stitch-mcp-bridge.md:51`                  | Task doc shows `tests/` should be `test/`                                                     | NIT        | Copilot          |
| F11 | `extensions/stitch-bridge/tests/`                          | Empty `tests/` directory                                                                       | NIT        | Independent      |

## Actions

- F1–F3: Apply `basename(screenName)` before `join()` in design.generate, design.edit, design.get; throw on invalid name
- F4: Stage and commit boilerplate files
- F5: Replace bare catch with ENOENT-specific guard; log unexpected errors before rethrowing
- F6: Throw if `html` field is missing or not a string instead of silently writing `'[object Object]'`
- F7: Add tests for design.edit, design.get, design.list (test/tools/design-edit.test.ts, design-get.test.ts, design-list.test.ts)
- F8: Uncheck and defer access-control AC items; note deferred to platform layer (Task 0040)
- F9: Append `-${Math.random().toString(36).slice(2)}` to JSON-RPC ID
- F10: Fix `tests/` → `test/` in task doc
- F11: Remove empty `tests/` directory
