# Task: 0011 -- Fix Quality-Gate Default Command Validation

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | Audit remediation |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-25 |
| Branch | feat/0011-fix-quality-gate-default-command-validation |
| Source Finding IDs | P-002 |

---

## Goal

Make quality-gate default command execution path functional and validated safely.

---

## Immutable Finding Snapshot (Do Not Edit)

| ID | Axis | Severity | Evidence | Impact | Recommendation |
|----|------|----------|----------|--------|----------------|
| P-002 | Product | MUST_FIX | run_tests and lint defaults are rejected by assertSafeCommand before command parsing. | quality-gate CLI default tests/lint flows fail out-of-box. | Parse command first, validate executable token and args, and add regressions for defaults. |

---

## Scope

### In Scope

- Refactor run_tests and lint command parsing/validation order.
- Preserve command safety guarantees while allowing valid defaults.
- Add regression tests for default and custom command paths.

### Out of Scope

- Introducing new CLI commands.
- Refactoring unrelated parser modules.

---

## Requirements

1. Default run_tests and lint commands execute without false UNSAFE_COMMAND failures.
2. Command validation still rejects unsafe executables and args.
3. Automated tests cover both success and rejection paths.

---

## Acceptance Criteria

- [ ] AC1: pnpm --filter @openclaw/quality-gate q:cli run --tests executes tool path without UNSAFE_COMMAND failure.
- [ ] AC2: pnpm --filter @openclaw/quality-gate q:cli run --lint executes tool path without UNSAFE_COMMAND failure.
- [ ] AC3: Unsafe command payloads continue to be rejected.
- [ ] AC4: New and updated tests pass in quality-gate package.

---

## Implementation Steps

1. Refactor command handling in run_tests and lint tools.
2. Update spawn validation usage to parsed executable and args.
3. Add behavior tests and run package quality gates.

---

## Testing Plan

- pnpm --filter @openclaw/quality-gate test
- pnpm --filter @openclaw/quality-gate lint
- pnpm --filter @openclaw/quality-gate typecheck
- pnpm --filter @openclaw/quality-gate q:cli run --tests
- pnpm --filter @openclaw/quality-gate q:cli run --lint

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
