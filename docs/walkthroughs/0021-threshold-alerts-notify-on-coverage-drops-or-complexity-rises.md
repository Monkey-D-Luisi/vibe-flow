# Walkthrough: 0021 -- Threshold Alerts for Coverage Drops or Complexity Rises

## Task Reference

- Task: docs/tasks/0021-threshold-alerts-notify-on-coverage-drops-or-complexity-rises.md
- Source Issue: #155
- Branch: feat/0021-threshold-alerts-notify-on-coverage-drops-or-complexity-rises
- Status: DONE_VERIFIED

---

## Summary

Goal restated: add opt-in, policy-driven regression alerts for coverage drops
and complexity rises across both quality gate surfaces with deterministic
anti-noise behavior.

Implemented a shared alert contract in `@openclaw/quality-contracts` and wired
it into:

- `quality.gate` (product-team): baseline + dedupe from prior `quality.gate`
  events, structured alert output, and event payload traceability.
- `quality.gate_enforce` (quality-gate): caller-provided history support for
  regression alerts, including cooldown-based suppression from prior alert keys.
- `qcli run --gate`: alert CLI flags for thresholds and cooldown controls.

---

## Execution Journal

### Approach

1. Add one shared alert evaluator for policy parity.
2. Extend both tool contracts with an optional `alerts` input.
3. Emit structured alert metadata in tool outputs and event payloads.
4. Add behavior and parity tests, then run full workspace gates.

### Decisions

1. Alerting is opt-in (`alerts.enabled`) to preserve existing behavior for
   current callers.
2. Baseline comparison uses prior history samples and supports deterministic
   cooldown dedupe through emitted alert keys.
3. Alert payloads include `metric`, `baseline`, `observed`, `delta`,
   `threshold`, `reason`, and stable alert `key` for traceability and dedupe.
4. Shared alert logic was implemented in `packages/quality-contracts` and
   re-exported in both extensions to preserve contract parity.

### Commands Run

```bash
git checkout main
git pull origin main
git pull --no-rebase origin main
git checkout -b feat/0021-threshold-alerts-notify-on-coverage-drops-or-complexity-rises

pnpm --filter @openclaw/plugin-product-team exec vitest run test/quality/gate-alerts.test.ts test/tools/quality-gate.test.ts test/config/quality-gate-contract.test.ts
pnpm --filter @openclaw/quality-gate exec vitest run test/gate_enforce.autotune.test.ts test/quality-contract-parity.test.ts

pnpm test
pnpm lint
pnpm typecheck
```

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `docs/tasks/0021-threshold-alerts-notify-on-coverage-drops-or-complexity-rises.md` | Created/Modified | Added task spec from issue intake and finalized status/DoD on completion. |
| `docs/walkthroughs/0021-threshold-alerts-notify-on-coverage-drops-or-complexity-rises.md` | Modified | Recorded implementation, validation, and closure evidence. |
| `docs/roadmap.md` | Modified | Promoted task `0021` (`PENDING` -> `IN_PROGRESS` -> `DONE`). |
| `docs/backlog/open-issues-intake.md` | Modified | Mapped issue `#155` to task `0021` and updated status traceability. |
| `docs/api-reference.md` | Modified | Documented `quality.gate` alert inputs and alerting output/event payload fields. |
| `docs/runbook.md` | Modified | Added operational usage/troubleshooting guidance for regression alerting. |
| `packages/quality-contracts/src/gate/alerts.ts` | Created | Added shared regression alert evaluator with thresholds and cooldown dedupe. |
| `packages/quality-contracts/src/gate/auto-tune.ts` | Modified | Extended history sample shape to include optional `alertKeys`. |
| `packages/quality-contracts/package.json` | Modified | Exported `./gate/alerts` shared contract entry. |
| `extensions/product-team/src/quality/gate-alerts.ts` | Created | Re-exported shared alert contracts for product-team usage. |
| `extensions/quality-gate/src/gate/alerts.ts` | Created | Re-exported shared alert contracts for quality-gate usage. |
| `extensions/product-team/src/schemas/quality-gate.schema.ts` | Modified | Added `alerts` schema contract (`enabled`, thresholds, cooldown policy). |
| `extensions/product-team/src/tools/quality-gate.ts` | Modified | Added alert config handling, history extraction, structured outputs, and event logging. |
| `extensions/quality-gate/src/tools/gate_enforce.ts` | Modified | Added alert config contract and history-driven alert evaluation output. |
| `extensions/quality-gate/cli/qcli.ts` | Modified | Added `--alerts`, threshold, and cooldown flags; history parser now accepts `alertKeys`. |
| `extensions/product-team/test/quality/gate-alerts.test.ts` | Created | Added shared alert behavior tests for trigger + dedupe scenarios. |
| `extensions/product-team/test/tools/quality-gate.test.ts` | Modified | Added tool-level alert emission + event payload assertions. |
| `extensions/product-team/test/config/quality-gate-contract.test.ts` | Modified | Added schema parity checks for alert config keys across tool surfaces. |
| `extensions/quality-gate/test/gate_enforce.autotune.test.ts` | Modified | Added alert trigger and cooldown suppression tests in gate-enforce flow. |
| `extensions/quality-gate/test/quality-contract-parity.test.ts` | Modified | Added parity test for shared regression alert evaluator outputs. |

---

## Verification Evidence

| Check | Result | Evidence |
|------|--------|----------|
| Product-team targeted tests | PASS | `12` tests passed across alert/tool/contract suites. |
| Quality-gate targeted tests | PASS | `12` tests passed across alert and parity suites. |
| Workspace tests | PASS | `pnpm test` passed (`product-team: 60 files/358 tests`, `quality-gate: 15 files/145 tests + 3 skipped`). |
| Lint | PASS | `pnpm lint` passed across workspace packages. |
| Typecheck | PASS | `pnpm typecheck` passed across workspace packages after readonly fix. |

---

## Closure Decision

- Current status: DONE_VERIFIED
- Closure criteria met: YES
- Notes: Alerting is now opt-in, policy-driven, deterministic, and includes
  baseline/dedupe traceability in outputs and events.

---

## Follow-ups

- Consider adding dedicated CLI parser tests for `qcli --gate` alert flags if
  command-surface changes accelerate.

---

## Checklist

- [x] Task spec read end-to-end
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Closure decision updated to DONE_VERIFIED
