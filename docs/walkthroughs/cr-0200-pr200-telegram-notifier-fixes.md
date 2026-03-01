# Walkthrough CR-0200 — PR #200 Telegram Notifier Fixes

## Summary

Addressed all MUST_FIX and SHOULD_FIX findings from Gemini and Copilot review of PR #200
(telegram-notifier plugin), plus committed the untracked scaffolding files (FALSE_POSITIVE).

## Fixes Implemented

### M1 — Missing backslash escape in `escapeMarkdownV2`
`formatting.ts`: Added `\\` to the character class so backslash characters in user-supplied
content are escaped before embedding in MarkdownV2. Fixed unnecessary-escape lint warning
(`\_` → `_`) in the same character class.

### M2 — Unescaped URL in MarkdownV2 link
`formatting.ts`: Added `url.replace(/[)\\]/g, '\\$&')` before embedding the URL in
`[View](...)` syntax. `)` and `\` in URLs can break the link syntax and enable phishing.

### M3 — Markdown injection in `/idea` handler
`index.ts`: Wrapped `ideaText` with `escapeMarkdownV2()` before embedding in the response.

### S1 — `void sendTg(...)` ignores async errors
`index.ts`: Replaced `void sendTg(...)` with `Promise.resolve(sendTg(...)).catch(logger.error)`
so async send failures are reliably logged.

### S2 — `maxPerMinute` becomes `NaN` on bad config
`index.ts`: Added `Number.isFinite(parsed) && parsed > 0` guard; defaults to 20 on failure.

### S3 / S4 — Unsafe type assertions in `getConfig`, `formatPrCreation`, `formatQualityGate`
Replaced `as Record<string, unknown>` with `typeof` runtime guards in all three functions.

### S5 — `batchMinorEvents` dead config
Removed `batchMinorEvents` from `NotifierConfig` interface, `getConfig`, plugin manifest
(`openclaw.plugin.json`), and test mock. The field was documented but had no effect on
queue behavior.

### S6 — Walkthrough said "~1/3sec" vs actual `msPerTick = 3000`
Fixed to "~3sec".

### S7 — Acceptance criteria overstated for `/status` and `/idea`
Marked those ACs as partial (`[~]`) with follow-up tasks noted (0042).

### S8 — Task doc referenced `api.registerHook()` instead of `api.on(...)`
Updated to match actual plugin SDK usage.

### FP1 — Missing scaffolding files (Copilot FALSE_POSITIVE)
`openclaw.plugin.json`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `.eslintrc.cjs`
existed locally (untracked). Committed in this CR so the loader wiring in `openclaw.docker.json`
is complete.

### Test coverage
Added `escapes backslash` test to `test/formatting.test.ts` (32 total tests).

## Commands Run

```bash
pnpm --filter @openclaw/plugin-telegram-notifier test       # 32 passed
pnpm --filter @openclaw/plugin-telegram-notifier lint       # clean
pnpm --filter @openclaw/plugin-telegram-notifier typecheck  # clean
```
