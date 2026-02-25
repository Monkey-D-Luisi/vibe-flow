# Task: cr-0167 -- PR #167 Review Fixes

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | #167 |
| Priority | HIGH |
| Created | 2026-02-25 |
| Branch | `feat/0007-hardening` |

---

## Goal

Execute the `code review` workflow for PR #167 and resolve all MUST_FIX and SHOULD_FIX findings from independent review and review comments.

---

## Findings and Classification

| # | Severity | Source | Finding |
|---|----------|--------|---------|
| 1 | MUST_FIX | Independent review + bot comments | `secret-detector` used unbounded recursion in metadata scan and log scrubbing, allowing stack overflow (`RangeError`) with deeply nested objects. |
| 2 | SHOULD_FIX | Independent review + bot comments | Secret detection included an over-broad base64-like pattern causing false positives for non-secret values (for example commit-like hashes). |
| 3 | SHOULD_FIX | Independent review + bot comments | Allow-list validator only checked disallowed extras and did not fail when policy-required tools were missing from an agent allow-list. |
| 4 | SHOULD_FIX | Independent review + bot comments | Allow-list policy/configuration drifted from documented operator flows (`quality.tests`, `quality.gate`, `workflow.events.query`). |

---

## Changes

- Replaced recursive secret traversal with iterative stack-based traversal in `secret-detector`.
- Removed the broad base64-like detection rule that triggered false positives.
- Added regression tests for deep nesting safety and commit-hash false positive prevention.
- Updated allow-list validator policy to include the documented role-tool set.
- Added reverse validation to fail when policy-required tools are missing from an agent allow-list.
- Updated `openclaw.json` role allow-lists and `docs/allowlist-rationale.md` to match documented tool ownership.
- Updated `docs/runbook.md` routine operations to explicitly include `quality.gate`.

---

## Non-Blocking Comments Resolved by Classification

- `FALSE_POSITIVE`: `leaseManager` extra property in deps is not a TypeScript type error under structural typing.
- `SUGGESTION`: parsing `docs/allowlist-rationale.md` as runtime policy source was not adopted in this pass to keep validator deterministic and simple.
- `SUGGESTION`: concurrency-check deduplication (`LeaseManager` vs state machine) deferred because current review scope focused on security and allow-list correctness.
- `SUGGESTION`: dedicated `cost-summary` unit tests deferred; existing behavior remains covered via tool-level integration tests.

---

## Definition of Done

- [x] MUST_FIX items resolved
- [x] SHOULD_FIX items resolved or explicitly classified as non-blocking
- [x] Review artifact committed (`docs/tasks/cr-0167-*` + `docs/walkthroughs/cr-0167-*`)
- [x] Validation gates passed (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm tsx scripts/validate-allowlists.ts`)
