# Task: cr-0169 -- PR #168 Review Fixes

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| PR | #168 |
| Priority | HIGH |
| Created | 2026-02-25 |
| Branch | `feat/0008-pr-bot-skill` |

---

## Goal

Execute the `code review` workflow for PR #168 and resolve all MUST_FIX and SHOULD_FIX findings from independent review and review comments.

---

## Findings and Classification

| # | Severity | Source | Finding |
|---|----------|--------|---------|
| 1 | MUST_FIX | Independent review + Copilot comment | PR-Bot generated labels with `:` (`scope:*`, `epic:*`, `area:*`), but label validation rejected `:`, causing label sync/apply to fail at runtime. |
| 2 | MUST_FIX | Independent review + Copilot comment | `after_tool_call` hook could propagate unexpected runtime errors, violating the requirement that PR-Bot failures must not break tool execution. |
| 3 | SHOULD_FIX | Independent review + Gemini/Copilot comments | Task-link generation used hardcoded `blob/main` and weak path sanitization for `metadata.taskPath`. |
| 4 | SHOULD_FIX | Independent review + Copilot comment | PR number parsing accepted malformed partially numeric strings via `parseInt`, risking accidental targeting of wrong PR numbers. |
| 5 | SHOULD_FIX | Gemini comment + independent review | `asStringArray` in PR-Bot did not trim retained values, making label derivation brittle for whitespace-padded tags/criteria. |
| 6 | NIT | Copilot low-confidence comment | Walkthrough text typo: “due missing” grammar issue. |

---

## Changes

- Allowed `:` in GitHub label-name validation to match the required label format (`scope:*`, `epic:*`, `area:*`).
- Hardened PR-Bot hook execution:
  - defensive parsing of `event.params`
  - catch-all guard in `PrBotAutomation.handleAfterToolCall`
  - top-level catch in registered `after_tool_call` callback.
- Strengthened task-link building:
  - added taskPath sanitization against traversal/dot segments
  - used configured `github.defaultBase` instead of hardcoded `main`.
- Tightened PR number parsing to accept only fully numeric strings.
- Fixed `asStringArray` to return trimmed values.
- Added regression tests for:
  - defaultBase link generation
  - traversal fallback to safe search URL
  - malformed PR-number rejection
  - whitespace-trimmed tag labels
  - hook callback error swallowing.
- Fixed walkthrough grammar typo.

---

## Non-Blocking Comments Resolved by Classification

- `SUGGESTION`: Refactor `metadata.area` handling with `flat()` for readability; current implementation is already explicit and tested, no behavioral defect.
- `QUESTION/LOW_CONFIDENCE`: “Path traversal” concern was valid as hardening, but impact is limited to generated comment URLs; fixed as SHOULD_FIX hardening.

---

## Definition of Done

- [x] MUST_FIX items resolved
- [x] SHOULD_FIX items resolved or explicitly classified as non-blocking
- [x] Review artifact committed (`docs/tasks/cr-0169-*` + `docs/walkthroughs/cr-0169-*`)
- [x] Validation gates passed (`pnpm lint`, `pnpm typecheck`, `pnpm test`)