# CR-0200 — PR #200 Review Findings: Telegram Notifier Fixes

| Field  | Value                                        |
|--------|----------------------------------------------|
| PR     | #200 feat(task-0037): telegram channel integration plugin |
| Status | DONE                                         |

## Findings

### MUST_FIX

| # | File | Issue |
|---|------|-------|
| M1 | `src/formatting.ts:8` | `escapeMarkdownV2` missing `\` escape — backslash can bypass all other escapes |
| M2 | `src/formatting.ts:24` | `formatPrCreation` URL embedded unescaped in MarkdownV2 link — `)` / `\` in URL breaks link syntax |
| M3 | `src/index.ts:115` | `/idea` reflects unescaped user text — MarkdownV2 injection |

### SHOULD_FIX

| # | File | Issue |
|---|------|-------|
| S1 | `src/index.ts:160` | `void sendTg(...)` inside try/catch — async rejects not caught → unhandled rejection |
| S2 | `src/index.ts:40` | `maxPerMinute` not validated; becomes `NaN` on non-numeric config → queue never flushes |
| S3 | `src/index.ts:36,41` | Unsafe `as Record<string,unknown>` in `getConfig` — replace with `typeof` guard |
| S4 | `src/formatting.ts:19,30` | Unsafe `as Record<string,unknown>` in `formatPrCreation`/`formatQualityGate` |
| S5 | `src/index.ts:22,41` | `batchMinorEvents` parsed into config but never used — dead config misleads operators |
| S6 | `docs/walkthroughs/0037-telegram-channel-integration.md:11` | Says "~1/3sec" but `msPerTick=3000` (3 sec) |
| S7 | `docs/tasks/0037-telegram-channel-integration.md:109-110` | AC marks `/status` and `/idea` as fully implemented; they return placeholders |
| S8 | `docs/tasks/0037-telegram-channel-integration.md:127` | Says `api.registerHook()` but implementation uses `api.on(...)` |

### FALSE_POSITIVE

| # | Comment | Reason |
|---|---------|--------|
| FP1 | Copilot: "missing scaffolding files" | Files exist locally (untracked); committed in this CR |

## Fixes Applied

- M1: Added `\\` to `escapeMarkdownV2` character class
- M2: Escape `)` and `\` in URL before embedding in MarkdownV2 link
- M3: Wrap `escapeMarkdownV2()` around `ideaText` in `/idea` response
- S1: Replace `void sendTg(...)` with `Promise.resolve(...).catch(logger.error)`
- S2: Validate `parsedMaxPerMinute` with `Number.isFinite() && > 0`, else default 20
- S3: Replace type assertions in `getConfig` with `typeof` runtime guards
- S4: Replace type assertions in `formatPrCreation`/`formatQualityGate` with `typeof` guards
- S5: Remove `batchMinorEvents` from `NotifierConfig` interface, `getConfig`, and config schema
- S6: Fix walkthrough to say "~3sec"
- S7: Mark `/status` and `/idea` ACs as partial (placeholder) with follow-up tasks noted
- S8: Fix `api.registerHook()` → `api.on(...)`
- FP1: Commit scaffolding files (`openclaw.plugin.json`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `.eslintrc.cjs`)
- Added test for backslash escaping to `test/formatting.test.ts`
