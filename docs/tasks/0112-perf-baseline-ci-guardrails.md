# Task 0112: Performance Baseline and CI Guardrails

- **Epic:** EP16 -- E2E Testing & Load Characterization
- **Phase:** 12B -- Protocol & Performance
- **Status:** IN_PROGRESS
- **Branch:** `feat/EP16-e2e-testing-load`

## Objective

Establish performance baselines from Task 0110 benchmarks and add CI guardrails
that detect significant performance regressions on main branch merges.

## Acceptance Criteria

- [ ] `docs/benchmarks/baseline.json` with 5 baseline metrics from Task 0110
- [ ] `tools/perf-compare.ts` reads baseline and current run, exits non-zero on regression
- [ ] CI job runs benchmarks on main branch merges (not every PR)
- [ ] Regression thresholds at 200% of baseline (generous for CI runner variance)
- [ ] `pnpm perf:compare` script in root package.json
- [ ] All existing tests still pass

## Notes

- Benchmarks are machine-dependent — use relative thresholds, not absolute
- CI runner performance varies — 200% threshold accounts for this
- Baseline values from Task 0110 benchmarks on developer machine
