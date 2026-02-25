# Task: 0014 -- Add GitHub Webhook Signature Verification

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-25 |
| Branch | feat/0014-add-github-webhook-signature-verification |
| Source Finding IDs | S-003 |

---

## Goal

Cryptographically verify GitHub webhook authenticity before processing CI events.

---

## Immutable Finding Snapshot (Do Not Edit)

| ID | Axis | Severity | Evidence | Impact | Recommendation |
|----|------|----------|----------|--------|----------------|
| S-003 | Security | HIGH | CI webhook route validates event semantics but not X-Hub-Signature-256 authenticity. | Forged payload risk remains if route is reachable and enabled. | Implement HMAC signature verification with fail-closed behavior. |

---

## Scope

### In Scope

- Add shared secret config fields and schema validation.
- Implement HMAC SHA-256 verification for webhook requests.
- Add tests for valid, missing, and invalid signatures.

### Out of Scope

- Non-GitHub webhook providers.
- Unrelated webhook routing changes.

---

## Requirements

1. Webhook processing rejects unsigned or invalid signature payloads.
2. Verification happens before business-side effects.
3. Operational docs include secret configuration instructions.

---

## Acceptance Criteria

- [ ] AC1: Valid signed payload is accepted and processed.
- [ ] AC2: Missing signature returns authorization failure response.
- [ ] AC3: Invalid signature returns authorization failure response with no side effects.
- [ ] AC4: Tests cover success and failure signature paths.

---

## Implementation Steps

1. Extend config schema with webhook secret.
2. Implement signature validation utility.
3. Add tests and update runbook docs.

---

## Testing Plan

- pnpm --filter @openclaw/plugin-product-team test -- test/github/ci-feedback.test.ts test/index.test.ts
- pnpm --filter @openclaw/plugin-product-team lint
- pnpm --filter @openclaw/plugin-product-team typecheck

---

## Definition of Done

- [x] Acceptance criteria validated with command-backed evidence
- [x] Implementation completed with no scope drift
- [x] Tests added or updated and passing
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated with execution journal and closure decision

---

## Agent References

- [Findings Processing Workflow](../../.agent/rules/findings-processing-workflow.md)
- [Source Audit](../audits/2026-02-25-comprehensive-audit-product-security-architecture-development.md)
