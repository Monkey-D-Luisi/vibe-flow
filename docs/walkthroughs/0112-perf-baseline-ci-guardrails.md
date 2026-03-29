# Walkthrough: 0112 -- Performance Baseline and CI Guardrails

## Task Reference

- Task: `docs/tasks/0112-perf-baseline-ci-guardrails.md`
- Epic: EP16 -- E2E Testing & Load Characterization
- Branch: `feat/EP16-e2e-testing-load`
- PR: TBD

---

## Summary

Established performance baselines from Task 0110 benchmarks (5 metrics) and added
CI guardrails via a perf-compare script and a `perf-baseline` CI job that runs on
main branch merges only. Regression threshold is 200% of baseline to accommodate
CI runner variance.

---

## Context

Task 0110 produced benchmark data; this task captures it as a baseline and adds
automated regression detection. The perf-compare script reads baseline.json and
current.json, compares each metric directionally, and exits non-zero on regression.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| 200% regression threshold | CI runners vary widely; generous threshold avoids false positives |
| Main-only perf CI job | Benchmarks are slow; run only on merge, not every PR push |
| JSON baseline format | Machine-readable, versionable, easy to update |
| Benchmark writes current.json | Enables perf-compare without manual data capture |
| Push trigger added to CI | perf-baseline job needs push events on main |

---

## Implementation Notes

- Baseline metrics: serial_duration_ms, serial_ops_per_second, burst_p99_write_ms, burst_p99_message_ms, burst_memory_mb
- Benchmark test now writes `docs/benchmarks/current.json` after burst scenario
- `current.json` is gitignored (generated artifact)
- `pnpm perf:bench` runs benchmarks, `pnpm perf:compare -- --current docs/benchmarks/current.json` compares

---

## Commands Run

```bash
pnpm perf:bench
pnpm perf:compare -- --current docs/benchmarks/current.json
pnpm test   # 2,391 tests, 0 failures
pnpm lint   # 0 errors
pnpm typecheck  # 0 errors
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `docs/benchmarks/baseline.json` | Created | 5 baseline metrics from Task 0110 |
| `tools/perf-compare.ts` | Created | Comparison script with directional thresholds |
| `.github/workflows/quality-gate.yml` | Updated | Added push trigger and perf-baseline CI job |
| `extensions/product-team/test/benchmarks/concurrent-load.test.ts` | Updated | Writes current.json after benchmark run |
| `package.json` | Updated | Added perf:bench and perf:compare scripts |
| `.gitignore` | Updated | Ignore docs/benchmarks/current.json |
| `docs/tasks/0112-perf-baseline-ci-guardrails.md` | Created | Task documentation |
| `docs/walkthroughs/0112-perf-baseline-ci-guardrails.md` | Created | This walkthrough |
| `docs/roadmap.md` | Updated | Task 0112 → DONE |
