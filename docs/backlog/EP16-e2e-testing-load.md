# EP16 -- E2E Testing & Load Characterization

> Status: DONE
> Dependencies: EP13
> Phase: 12 (Quality at Scale)
> Target: May 2026

## Motivation

The system has never been tested under realistic concurrent load. The e2e test
suite from EP08 (task 0045) exists but is not wired into CI. As phases 10-11 add
intelligence and protocol changes, the regression risk increases. A safety net
is needed that catches issues across the full pipeline before they ship.

**Current state:**
- Unit tests: ~99 test files, running in CI (live)
- E2E test suite: exists in codebase but not in CI workflow
- Load testing: none
- Performance baselines: none
- SQLite contention under concurrent agents: unmeasured

**Target state:**
- E2E pipeline test runs on every PR in CI.
- Load benchmark documents system behavior under 8 concurrent agents.
- Performance baselines tracked in CI with regression guardrails.
- Protocol regression suite validates EP13 contracts under stress.

## Task Breakdown

### 12A: E2E & Load (parallel)

#### Task 0109: E2E Pipeline Test with LLM Mocks in CI

**Scope:** Wire the existing e2e test suite into CI and extend it to test the
full pipeline (IDEA → DONE) using mocked LLM responses.

**LLM mock strategy:**
- Create fixture directory: `extensions/product-team/src/__fixtures__/llm-responses/`
- One fixture per agent per stage (e.g., `pm-idea.json`, `back-1-implementation.json`)
- Mock intercepts `before_model_resolve` and returns fixture data
- Fixtures contain valid schema-conforming responses for each role

**Pipeline flow tested:**

```
IDEA (pm) → ROADMAP (pm) → STORIES (po) → DECOMPOSITION (tech-lead)
→ DESIGN (skip) → IMPLEMENTATION (back-1) → QA (qa)
→ CODE_REVIEW (tech-lead) → PR (devops) → DONE
```

**CI integration:**
- New job in `.github/workflows/quality-gate.yml`: `e2e-pipeline`
- Runs after unit tests pass
- Timeout: 5 minutes (mocked responses should be fast)
- Failure blocks merge (required status check)

**Files to create/modify:**
- `extensions/product-team/src/__fixtures__/llm-responses/` (new directory + fixtures)
- `extensions/product-team/src/__tests__/e2e-pipeline.test.ts` (new or extend existing)
- `.github/workflows/quality-gate.yml` (modify: add e2e job)
- Vitest config: separate e2e test pattern from unit tests

**Acceptance criteria:**
- Full 10-stage pipeline completes with mocked LLM responses
- CI job completes in < 5 minutes
- Failure in any stage produces clear error with stage name and agent
- Quality gates evaluated during pipeline (with mock quality data)
- Decision engine invoked at least once during pipeline
- >= 90% coverage of pipeline orchestration code

---

#### Task 0110: Concurrent Agent Load Benchmark

**Scope:** Measure system behavior when 8 agents operate concurrently, focusing
on SQLite contention, event log throughput, and inter-agent message latency.

**Benchmark scenarios:**

| Scenario | Agents | Pipelines | Duration | Measures |
|----------|--------|-----------|----------|----------|
| Serial baseline | 1 | 1 | Until done | Baseline throughput, latency |
| Light concurrency | 4 | 2 | Until done | % throughput degradation |
| Full concurrency | 8 | 4 | Until done | % throughput degradation, contention |
| Burst | 8 | 8 simultaneous | 5 min | Error rate, deadlocks, WAL buildup |

**SQLite contention metrics:**
- Write latency (wall clock for INSERT/UPDATE)
- Lock wait time (if WAL mode produces busy errors)
- Database file size growth rate
- WAL file size peak

**Inter-agent metrics:**
- Message send → deliver latency (from event log timestamps)
- Spawn request → agent active latency
- Decision escalation → human notification latency (mocked)

**Output:** Benchmark report in `docs/benchmarks/concurrent-load.md` with:
- Throughput table across scenarios
- Contention graph (agents vs write latency)
- Identified bottlenecks with severity ranking
- Recommended mitigations

**Files to create/modify:**
- `extensions/product-team/src/__tests__/benchmarks/concurrent-load.bench.ts` (new)
- `docs/benchmarks/concurrent-load.md` (new: report, updated after each run)

**Acceptance criteria:**
- All 4 scenarios run to completion without deadlocks or data corruption
- Report documents actual measured numbers (not estimates)
- Bottlenecks identified with severity
- Benchmark is reproducible (deterministic with seeded mocks)
- SQLite WAL mode handles concurrent writes without busy errors

---

### 12B: Protocol & Performance (sequential after 12A)

#### Task 0111: Protocol Regression Test Suite

**Scope:** Build a test suite that validates EP13 protocol contracts under stress
conditions: high message volume, concurrent sends, invalid payloads, and version
mismatches.

**Test categories:**

| Category | Tests | Purpose |
|----------|-------|---------|
| Schema fuzz | 50+ random payloads per message type | Find edge cases in schema validation |
| Concurrent messaging | 8 agents × 10 messages simultaneously | Message ordering, delivery guarantee |
| Invalid payloads | Missing required fields, wrong types, extra fields | Validation robustness |
| Version mismatch | Mixed protocol v1.0 and v1.1 agents | Forward compatibility |
| Large payloads | Messages with 100KB+ data | Memory and timeout behavior |
| Rate limiting | 100 messages/second burst | Backpressure behavior |

**Files to create/modify:**
- `extensions/product-team/src/__tests__/protocol-regression.test.ts` (new)
- `extensions/product-team/src/__tests__/protocol-fuzz.test.ts` (new)

**Acceptance criteria:**
- All test categories pass
- Schema fuzz tests generate valid random payloads using JSON Schema definitions
- Concurrent tests verify no message loss or corruption
- Invalid payloads produce clear error messages, never crash
- Test suite runs in under 60 seconds
- >= 95% coverage of protocol validation code

---

#### Task 0112: Performance Baseline and CI Guardrails

**Scope:** Establish performance baselines from task 0110 benchmarks and add CI
guardrails that fail the build if performance regresses significantly.

**Baselines tracked:**

| Metric | Unit | Regression Threshold |
|--------|------|---------------------|
| Pipeline completion time (serial) | minutes | > 150% of baseline |
| Event log write latency (p99) | milliseconds | > 200% of baseline |
| Message delivery latency (p99) | milliseconds | > 200% of baseline |
| Spawn latency (p99) | milliseconds | > 200% of baseline |
| Memory peak (single pipeline) | MB | > 150% of baseline |

**CI integration:**
- Performance benchmarks run on `main` branch merges (not on every PR — too slow)
- Results stored in `docs/benchmarks/baseline.json`
- Comparison script reads baseline and current run, fails if threshold exceeded
- GitHub comment on PR with performance delta summary

**Files to create/modify:**
- `docs/benchmarks/baseline.json` (new: performance baseline data)
- `tools/perf-compare.ts` (new: comparison script)
- `.github/workflows/quality-gate.yml` (modify: add perf job on main)

**Acceptance criteria:**
- Baseline established for all 5 metrics
- CI job compares current run against baseline
- Regression beyond threshold fails the build
- GitHub comment shows performance delta
- Baseline can be updated intentionally via script

## Definition of Done

- [ ] All 4 tasks completed
- [ ] E2E pipeline test runs in CI on every PR
- [ ] Load benchmark report documents concurrent behavior
- [ ] Protocol regression suite covers stress scenarios
- [ ] Performance baselines established and tracked in CI
- [ ] `pnpm test && pnpm lint && pnpm typecheck` passes
