# Walkthrough: 0014 -- Add GitHub Webhook Signature Verification

## Task Reference

- Task: docs/tasks/0014-add-github-webhook-signature-verification.md
- Source Finding IDs: S-003
- Branch: feat/0014-add-github-webhook-signature-verification
- Status: DONE_VERIFIED

---

## Summary

Implemented S-003 remediation by enforcing HMAC SHA-256 GitHub webhook
signature verification (`x-hub-signature-256`) before CI feedback automation
parses and handles webhook payload business logic.

Goal restatement: webhook events must be authenticated cryptographically and
fail closed when signature headers are missing or invalid.

---

## Execution Journal

### Decisions and Trade-offs

- Enforced `github.ciFeedback.webhookSecret` whenever
  `github.ciFeedback.enabled=true` to avoid insecure deployment defaults.
- Verified signatures against raw request bytes before JSON parsing to ensure
  authenticity checks run before side effects.
- Added dedicated signature utility (`webhook-signature.ts`) with
  `timingSafeEqual` and strict `sha256=` digest parsing for deterministic
  fail-closed behavior.

### Implementation

1. Updated plugin config schema and sample config to include
   `github.ciFeedback.webhookSecret`.
2. Added runtime config enforcement in `resolveGithubConfig` for enabled
   CI feedback without secret.
3. Added raw-body read/parsing split in CI feedback helpers to support
   signature verification before payload handling.
4. Added `assertValidGithubWebhookSignature` utility and integrated it in
   the HTTP webhook route.
5. Added tests for valid, missing, and invalid signatures at utility and
   route level.
6. Updated runbook operational guidance with secret configuration and
   troubleshooting checks.

### Commands Run

~~~bash
pnpm --filter @openclaw/plugin-product-team test -- test/github/ci-feedback.test.ts test/github/webhook-signature.test.ts test/index.test.ts
# PASS

pnpm --filter @openclaw/plugin-product-team lint
# PASS

pnpm --filter @openclaw/plugin-product-team typecheck
# PASS

pnpm test
# PASS

pnpm lint
# PASS

pnpm typecheck
# PASS
~~~

### Verification Evidence

| Check | Result | Evidence |
|------|--------|----------|
| AC1: Valid signed payload is accepted and processed | PASS | `extensions/product-team/test/index.test.ts` validates valid signed request reaches CI processing path (`202` for unresolved task branch) |
| AC2: Missing signature returns authorization failure response | PASS | `extensions/product-team/test/index.test.ts` expects `401` with `missing_x_hub_signature_256_header` |
| AC3: Invalid signature returns authorization failure response with no side effects | PASS | `extensions/product-team/test/index.test.ts` expects `401` with `invalid_x_hub_signature_256`; verification runs before automation handling |
| AC4: Tests cover success and failure signature paths | PASS | Added `extensions/product-team/test/github/webhook-signature.test.ts` and route-level signature tests in `extensions/product-team/test/index.test.ts` |
| Tests pass | PASS | `pnpm --filter @openclaw/plugin-product-team test -- test/github/ci-feedback.test.ts test/github/webhook-signature.test.ts test/index.test.ts` and `pnpm test` |
| Lint pass | PASS | `pnpm --filter @openclaw/plugin-product-team lint` and `pnpm lint` |
| Typecheck pass | PASS | `pnpm --filter @openclaw/plugin-product-team typecheck` and `pnpm typecheck` |

### Files Changed

- `extensions/product-team/src/github/webhook-signature.ts`
- `extensions/product-team/src/github/ci-feedback-utils.ts`
- `extensions/product-team/src/github/ci-feedback.ts`
- `extensions/product-team/src/index.ts`
- `extensions/product-team/openclaw.plugin.json`
- `extensions/product-team/test/github/webhook-signature.test.ts`
- `extensions/product-team/test/github/ci-feedback.test.ts`
- `extensions/product-team/test/index.test.ts`
- `docs/runbook.md`
- `openclaw.json`
- `docs/walkthroughs/0014-add-github-webhook-signature-verification.md`

---

## Closure Decision

- Current status: DONE_VERIFIED
- Closure criteria met: YES
- Notes:
  - S-003 is remediated with fail-closed signature verification.
  - CI feedback route now requires explicit secret configuration when enabled.

---

## Checklist

- [x] Source findings linked for traceability
- [x] Commands executed and recorded
- [x] Verification evidence attached
- [x] Closure decision updated to DONE_VERIFIED
