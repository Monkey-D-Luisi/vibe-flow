# Task 0116 — Coverage & Complexity CI Blocking Policy

**Epic:** EP17 — Security & Stability v2
**Status:** DONE
**Assignee:** agent

## Objective

Make coverage and complexity checks blocking in CI, with an escape hatch via
the `bypass-quality-gate` label on a PR.

## Deliverables

1. **CLI `--strict` flag** — `qcli run --gate --strict` exits non-zero on
   `warn` verdicts (in addition to `fail` verdicts that already exit non-zero).
2. **CI verdict update** — Coverage and complexity outcomes now contribute to the
   overall quality-gate verdict. Previously only tests, lint, and vulnerability
   policy were blocking.
3. **Label bypass** — If the PR has the `bypass-quality-gate` label, the quality
   gate posts a ⚠️ BYPASSED verdict comment but the job still succeeds.
4. **Complexity icon fix** — Changed complexity icon from ⚠️ to ❌ on failure for
   consistency with other blocking checks.

## Files Changed

| File | Change |
|------|--------|
| `extensions/quality-gate/cli/qcli.ts` | Added `--strict` flag to `parseGateArgs`, gate execution, and usage text |
| `.github/workflows/quality-gate.yml` | Added coverage/complexity to verdict, label bypass logic, exit 1 on failure |

## Acceptance Criteria

- [x] `qcli run --gate --strict` exits 1 when verdict is `warn`
- [x] CI fails when coverage or complexity step fails
- [x] CI passes (BYPASSED) when `bypass-quality-gate` label is present
- [x] PR comment shows BYPASSED status with callout
