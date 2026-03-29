# Concurrent Agent Load Benchmark Report

> Generated: 2026-03-29
> Environment: Windows, Node 22, in-memory SQLite (WAL mode)
> Task: 0110 — EP16 E2E Testing & Load Characterization

## Summary

All 4 benchmark scenarios complete without deadlocks, errors, or data
corruption. The in-memory SQLite backend handles concurrent writes from
8 simultaneous pipelines (144 operations) in under 15ms, demonstrating
excellent single-process concurrency characteristics.

## Results

| Scenario | Pipelines | Ops | Duration (ms) | Ops/s | Avg Write (ms) | P99 Write (ms) | Avg Msg (ms) | P99 Msg (ms) | Memory (MB) | Errors |
|----------|-----------|-----|---------------|-------|----------------|----------------|--------------|--------------|-------------|--------|
| Serial baseline | 1 | 18 | 6.77 | 2,659 | 0.41 | 3.04 | 0.32 | 1.56 | 17.07 | 0 |
| Light concurrency | 2 | 36 | 3.88 | 9,278 | 0.13 | 0.56 | 0.30 | 0.49 | 17.43 | 0 |
| Full concurrency | 4 | 72 | 7.70 | 9,347 | 0.21 | 1.43 | 0.62 | 0.97 | 17.98 | 0 |
| Burst | 8 | 144 | 13.37 | 10,774 | 0.21 | 1.44 | 1.28 | 1.53 | 18.97 | 0 |

## Analysis

### Throughput Scaling

Operations per second scale well from 1 to 8 pipelines:
- Serial: ~2,659 ops/s (warm-up overhead in first pipeline)
- 2 pipelines: ~9,278 ops/s (3.5x improvement)
- 4 pipelines: ~9,347 ops/s (roughly flat — limited by single-threaded Node.js)
- 8 pipelines: ~10,774 ops/s (slight improvement from async batching)

The throughput plateau at ~10K ops/s reflects Node.js single-threaded
execution. SQLite in-memory writes are fast enough that JS execution is
the bottleneck, not database I/O.

### Write Latency

P99 write latency stays below 3.1ms across all scenarios. The serial baseline
shows higher P99 (3.04ms) due to first-call JIT warm-up. Under load, P99
stabilizes around 1.4ms — no contention degradation observed.

### Message Delivery Latency

Average message latency increases moderately from 0.32ms (serial) to 1.28ms
(burst). P99 stays under 1.6ms. No message loss or corruption detected across
all scenarios.

### Memory Usage

Memory grows linearly from ~17MB (baseline) to ~19MB (8 pipelines). The
2MB growth for 8× concurrent pipelines demonstrates efficient memory usage.
No memory leaks observed.

## Bottleneck Analysis

| Bottleneck | Severity | Description | Mitigation |
|-----------|----------|-------------|------------|
| Node.js single-thread | LOW | Throughput plateaus at ~10K ops/s | Move to worker threads for CPU-bound ops if needed |
| First-call JIT warm-up | INFO | Serial baseline shows higher P99 | Expected behavior, no action needed |
| In-memory SQLite limitations | INFO | Cannot test WAL contention or disk I/O latency | Run on-disk benchmarks for production characterization |

## Conclusions

1. **No deadlocks or data corruption** across all scenarios
2. **No SQLite busy errors** — in-memory WAL mode handles concurrent writes cleanly
3. **Sub-2ms P99 latency** for both writes and messages under burst load
4. **Linear memory scaling** — ~250KB per pipeline, well within limits
5. **10K+ ops/s throughput** at 8 concurrent pipelines

The system handles concurrent agent load well within acceptable parameters
for the current deployment model (single Docker container, SQLite backend).
