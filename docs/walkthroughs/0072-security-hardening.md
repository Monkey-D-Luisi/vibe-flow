# Walkthrough 0072: SEC-002 + SEC-008 — Security Hardening (MEDIUM)

## Source Finding IDs
SEC-002, SEC-008

## Execution Journal

### Confirm SEC-002: Timing-Unsafe Token Comparison
Inspected `extensions/model-router/src/provider-health.ts` line 141. Confirmed bearer token compared with `!==` operator, vulnerable to timing side-channel.

### Fix SEC-002: Apply timingSafeEqual
Replaced the `!==` string comparison with `crypto.timingSafeEqual` using buffer conversion, consistent with the existing pattern in `webhook-signature.ts`.

### Confirm SEC-008: Token in Script Text
Inspected `extensions/product-team/src/hooks/auto-spawn.ts` line 482. Confirmed `OPENCLAW_GATEWAY_TOKEN` was embedded directly in the spawned script source and `process.env` was passed in full to child processes.

### Fix SEC-008: Environment-Based Token Passing
Refactored auto-spawn to:
1. Pass gateway token via the child process environment variable instead of embedding in script text
2. Restrict the child environment to an allowlist of necessary variables (PATH, HOME, NODE_ENV, OPENCLAW_GATEWAY_TOKEN, etc.)

**Commands run:**
```
pnpm --filter @openclaw/model-router test
pnpm --filter @openclaw/product-team test
pnpm lint
```

**Result:** All tests pass. No lint warnings.

## Verification Evidence
- `provider-health.ts` now uses `crypto.timingSafeEqual` for bearer token comparison
- `auto-spawn.ts` no longer embeds token in script text; uses env variable
- Child process environment restricted to allowlisted variables only
- All model-router and product-team tests pass
- Commit d9c6e97 merged to main

## Closure Decision
**Status:** DONE
**Residual risk:** None — timing side-channel eliminated; token exposure surface minimized
**Date:** 2026-03-05
