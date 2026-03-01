# Task cr-0199 -- PR #199 Review Findings

| Field   | Value                                    |
|---------|------------------------------------------|
| Task    | cr-0199                                  |
| PR      | #199                                     |
| Branch  | feat/0036-multi-model-provider-config    |
| Status  | DONE                                     |

## Findings

### MUST_FIX

| # | File | Issue |
|---|------|-------|
| 1 | `extensions/model-router/` | Missing `openclaw.plugin.json` manifest (required by arch standards) |
| 2 | `extensions/model-router/vitest.config.ts` | No coverage thresholds — CI quality gate cannot enforce coverage |
| 3 | `extensions/model-router/tsconfig.json` | `exclude` lists `"tests"` (plural) but dir is `test` (singular) |
| 4 | `extensions/model-router/src/provider-health.ts` | `checkProvider` resolves `connected: true` for any HTTP status (401/5xx appear healthy) |
| 5 | `docs/tasks/0036-multi-model-provider-config.md` | Goal/acceptance criteria still reference "four providers" after GitHub Copilot was dropped |

### SHOULD_FIX

| # | File | Issue |
|---|------|-------|
| 6 | `extensions/model-router/src/provider-health.ts` | HEAD response must not include a body (RFC 9110) |
| 7 | `extensions/model-router/src/provider-health.ts` | Double-resolve risk: timeout+destroy fires both timeout and error handlers |
| 8 | `extensions/model-router/src/provider-health.ts` | Anthropic/Google URLs point to root domain, not actual API endpoints |
| 9 | `extensions/model-router/src/provider-health.ts` | Health endpoint has no auth — any caller can probe provider keys |
| 10 | `extensions/model-router/test/provider-health.test.ts` | Missing tests: 200/207/500 paths and HEAD body suppression |

## Fixes Applied

1. Created `openclaw.plugin.json` with `id`, `name`, `version`, `description`, `configSchema`
2. Added `COVERAGE_THRESHOLDS` and `thresholds` block to `vitest.config.ts`; removed `passWithNoTests`
3. Fixed `exclude` typo: `"tests"` → `"test"` in `tsconfig.json`
4. `checkProvider` now checks `statusCode`: `< 500` → connected, `>= 500` → not connected
5. Updated task doc: "four LLM providers" → "three LLM providers (OpenAI, Anthropic, Google)"
6. `writeJson` now suppresses body when `req.method === 'HEAD'`
7. Added `settled` flag to prevent double-resolve on timeout+destroy sequence
8. Updated Anthropic URL to `https://api.anthropic.com/v1/models`; Google to `https://generativelanguage.googleapis.com/v1beta/models`; added `anthropic-version` header
9. Optional bearer-token auth via `HEALTH_CHECK_SECRET` env var (returns 401 if set and header missing/wrong)
10. Added 7 new tests: 200 all-connected, 207 partial, 500 throw, HEAD no-body, 401 no-token, 200 correct-token
    Used injectable `checkFn` parameter instead of low-level https mocking
