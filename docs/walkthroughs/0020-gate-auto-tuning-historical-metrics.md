# Walkthrough: 0020 -- Gate Auto-Tuning from Historical Metrics

## Task Reference

- Task: docs/tasks/0020-gate-auto-tuning-historical-metrics.md
- Source Issue: #154
- Branch: feat/0020-gate-auto-tuning-historical-metrics
- Status: DONE_VERIFIED

---

## Summary

Goal restated: implement optional, bounded quality-gate threshold auto-tuning based on historical metrics while preserving default static-policy behavior.

Implemented a shared auto-tuning engine in `@openclaw/quality-contracts` and integrated it into both gate surfaces:

- `quality.gate` (product-team) now supports optional historical tuning using prior `quality.gate` events and logs tuning evidence.
- `quality.gate_enforce` (quality-gate extension/CLI surface) now supports caller-provided historical metrics and bounded safeguard controls.
- Contract/schema tests and tool behavior tests were expanded to cover auto-tuning parity, bounded clamping, and disabled/default behavior.

---

## Execution Journal

### Approach

1. Introduce a shared tuning engine with deterministic safeguards.
2. Wire tuning into both product-team and quality-gate gate tools.
3. Add focused tests and run repository quality gates.

### Decisions

1. Added auto-tuning as opt-in (`autoTune.enabled`) to preserve existing static-threshold behavior by default.
2. Tuned only numeric thresholds with direct historical analogues (`coverageMinPct`, `lintMaxWarnings`, `complexityMaxCyclomatic`) and kept stricter binary checks unchanged.
3. Enforced safeguards through sample minimums, smoothing factor, per-metric max deltas, and absolute bounds to prevent policy drift.
4. Kept parity by re-exporting one shared implementation from both extensions and validating parity via tests.

### Commands Run

~~~bash
git checkout main
git pull origin main
git checkout -b feat/0020-gate-auto-tuning-historical-metrics

pnpm --filter @openclaw/plugin-product-team exec vitest run test/quality/gate-auto-tune.test.ts test/tools/quality-gate.test.ts test/config/quality-gate-contract.test.ts
pnpm --filter @openclaw/quality-gate exec vitest run test/gate_enforce.autotune.test.ts test/quality-contract-parity.test.ts

pnpm test
pnpm lint
pnpm typecheck
~~~

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `docs/tasks/0020-gate-auto-tuning-historical-metrics.md` | Created | Task specification for issue #154 promotion and execution scope. |
| `docs/walkthroughs/0020-gate-auto-tuning-historical-metrics.md` | Modified | Recorded implementation, validation, and closure evidence. |
| `docs/roadmap.md` | Modified | Added task `0020` as active queue item from open-issues intake. |
| `docs/backlog/open-issues-intake.md` | Modified | Mapped issue `#154` to task `0020` execution. |
| `docs/api-reference.md` | Modified | Documented `quality.gate` auto-tune inputs and tuning evidence outputs. |
| `docs/runbook.md` | Modified | Added operational guidance for bounded `quality.gate` auto-tuning. |
| `packages/quality-contracts/src/gate/auto-tune.ts` | Created | Shared deterministic auto-tuning engine with safeguards and adjustment evidence. |
| `packages/quality-contracts/package.json` | Modified | Exported new `./gate/auto-tune` entry point. |
| `extensions/product-team/src/quality/gate-auto-tune.ts` | Created | Product-team re-export for shared auto-tuning contracts. |
| `extensions/quality-gate/src/gate/auto-tune.ts` | Created | Quality-gate re-export for shared auto-tuning contracts. |
| `extensions/product-team/src/schemas/quality-gate.schema.ts` | Modified | Added `autoTune` input schema and safeguard fields. |
| `extensions/product-team/src/tools/quality-gate.ts` | Modified | Integrated event-history auto-tuning and tuning evidence logging. |
| `extensions/quality-gate/src/tools/gate_enforce.ts` | Modified | Added optional history-driven auto-tune policy evaluation. |
| `extensions/quality-gate/cli/qcli.ts` | Modified | Added gate CLI support for `--auto-tune`, `--history`, and safeguard flags. |
| `extensions/product-team/test/quality/gate-auto-tune.test.ts` | Created | Unit tests for tuner behavior, insufficient samples, and bounds clamping. |
| `extensions/product-team/test/tools/quality-gate.test.ts` | Modified | Added behavior tests for enabled/disabled auto-tuning and event evidence. |
| `extensions/product-team/test/config/quality-gate-contract.test.ts` | Modified | Added schema contract assertions for auto-tune safeguard keys. |
| `extensions/quality-gate/test/gate_enforce.autotune.test.ts` | Created | Added gate-enforce tool tests for history-driven tuning and default behavior. |
| `extensions/quality-gate/test/quality-contract-parity.test.ts` | Modified | Added parity test for auto-tuned policy outputs across both surfaces. |

---

## Verification Evidence

| Check | Result | Evidence |
|------|--------|----------|
| Implementation complete | PASS | Shared tuner + both gate integrations + schema/CLI/docs updates delivered. |
| Product-team targeted tests | PASS | Targeted vitest command passed (`11` tests). |
| Quality-gate targeted tests | PASS | Targeted vitest command passed (`8` tests). |
| Workspace tests | PASS | `pnpm test` passed (`product-team: 59 files/354 tests`, `quality-gate: 15 files/141 tests + 3 skipped`). |
| Lint | PASS | `pnpm lint` passed for all workspace packages. |
| Typecheck | PASS | `pnpm typecheck` passed for all workspace packages. |

---

## Closure Decision

- Current status: DONE_VERIFIED
- Closure criteria met: YES
- Notes: Auto-tuning is now opt-in, bounded, and traceable through tool details and event payload evidence.

---

## Checklist

- [x] Task spec read end-to-end
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Closure decision updated to DONE_VERIFIED
