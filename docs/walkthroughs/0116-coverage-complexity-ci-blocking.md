# Walkthrough 0116 — Coverage & Complexity CI Blocking Policy

## Context

Previously the CI quality gate only blocked on test failures, lint errors, and
vulnerability policy violations. Coverage and complexity were informational
(shown in the PR comment but never caused the job to fail). This left a gap
where low coverage or high complexity could merge unchecked.

## Approach

### 1. CLI `--strict` flag

Added a `--strict` flag to the gate sub-command in `qcli.ts`:

- `parseGateArgs` now returns `GateEnforceInput & { strict?: boolean }`.
- When strict mode is active, a `warn` verdict also causes `process.exit(1)`.
- Usage text updated to show `[--strict]`.

### 2. CI verdict section

Updated `.github/workflows/quality-gate.yml`:

- Added `COVERAGE_OUTCOME` and `COMPLEXITY_OUTCOME` to the `GATE_FAILED`
  checks alongside tests, lint, and vulnerability policy.
- Changed the complexity icon from ⚠️ to ❌ on failure for consistency.

### 3. Label bypass

Added a `bypass-quality-gate` label check:

- Uses `gh api` to fetch PR labels.
- If the label is present, verdict becomes ⚠️ BYPASSED (job succeeds).
- If the label is absent and the gate failed, `exit 1` with `::error::`.
- PR comment shows a callout when bypassed.

### 4. Report output

When bypassed, the PR comment includes:

> **⚠️ Quality gate bypassed** via `bypass-quality-gate` label.

## Risks & Mitigations

- **Bypass abuse**: The label is visible in PR history and review is required
  by CODEOWNERS, so misuse is auditable.
- **Flaky coverage**: Coverage is deterministic (no network/timing issues), so
  flaky failures are unlikely.
