# Task: cr-0171 -- PR #169 Review Fixes

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | #169 |
| Priority | HIGH |
| Created | 2026-02-25 |
| Branch | `feat/0009-ci-webhook-feedback` |

---

## Goal

Execute the `code review` workflow for PR #169 and resolve all MUST_FIX and SHOULD_FIX findings from independent review plus GitHub review comments.

---

## Findings and Classification

| # | Severity | Source | Finding |
|---|----------|--------|---------|
| 1 | SHOULD_FIX | Gemini comment | Webhook error classification relied on brittle string matching of error messages. |
| 2 | MUST_FIX | Copilot comment | Oversized request bodies were returned as `400 invalid_json_payload` instead of `413 payload_too_large`. |
| 3 | MUST_FIX | Copilot comment | CI webhook processing did not validate payload repository against configured repository, allowing spoofed cross-repo events. |
| 4 | MUST_FIX | Copilot comments | `github.ciFeedback.enabled` defaulted to `true` in both schema and repo config, exposing an unauthenticated side-effect endpoint by default. |
| 5 | SHOULD_FIX | Copilot comment | Task `0009` document had status/DoD completion but ambiguous AC completion signaling; made completion evidence explicit without mutating immutable AC checklist. |
| 6 | SHOULD_FIX | Copilot comment | Walkthrough `0009` referenced roadmap transition to `IN_PROGRESS` while roadmap/backlog now show `DONE`. |
| 7 | SHOULD_FIX | Independent review | `project-sync` PR status mapping returned `null` for `edited`/`synchronize`, so newly linked issues could be added without status assignment. |
| 8 | SUGGESTION | Gemini comment | Separate export aggregation into dedicated `index.ts` for `ci-feedback` module. |
| 9 | OUT_OF_SCOPE | Copilot comment | Full webhook signature verification (`X-Hub-Signature-256`) requested; partial hardening applied in this PR, full cryptographic verification deferred to hardening track. |

---

## Changes

- Replaced brittle webhook error string matching with typed error handling:
  - `InvalidJsonPayloadError` -> HTTP `400` (`invalid_json_payload`)
  - `RequestBodyTooLargeError` -> HTTP `413` (`payload_too_large`)
- Added expected repository enforcement in CI webhook automation:
  - introduced `ciFeedback.expectedRepository`
  - reject mismatched events with reason `repository-mismatch`
- Hardened defaults for CI webhook exposure:
  - `extensions/product-team/openclaw.plugin.json`: `github.ciFeedback.enabled` default -> `false`
  - `openclaw.json`: repository default `github.ciFeedback.enabled` -> `false`
  - `src/index.ts`: runtime fallback default for `ciFeedback.enabled` -> `false`
- Fixed project board sync status for PR update events:
  - `.github/workflows/project-sync.yml` maps all open non-draft PR states to `In Review`, including `edited` and `synchronize`.
- Resolved documentation inconsistencies in task/walkthrough `0009`:
  - updated DoD wording to make acceptance validation evidence explicit
  - aligned walkthrough references from `IN_PROGRESS` to final `DONE` state.
- Added/updated regression tests:
  - repository-mismatch rejection in `ci-feedback.test.ts`
  - route registration default behavior and explicit enablement in `index.test.ts`
  - HTTP 413 + HTTP 400 webhook handler behavior in `index.test.ts`.

---

## Non-Blocking Items and Rationale

- `SUGGESTION` (module-level export index): no behavioral defect; current split keeps file size and cohesion within standards.
- `OUT_OF_SCOPE` (signature verification): not part of current task scope; this pass removes default exposure and enforces repository match as immediate mitigation, while full signature verification remains an EP06 hardening follow-up.

---

## Definition of Done

- [x] MUST_FIX items resolved
- [x] SHOULD_FIX items resolved or documented with rationale
- [x] Independent review findings captured with severity
- [x] Review artifact committed (`docs/tasks/cr-0171-*` + `docs/walkthroughs/cr-0171-*`)
- [x] Validation gates executed (`pnpm lint`, `pnpm typecheck`, `pnpm test`)
