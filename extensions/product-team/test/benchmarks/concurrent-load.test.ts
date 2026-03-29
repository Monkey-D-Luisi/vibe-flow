/**
 * Concurrent Agent Load Benchmark
 *
 * Measures system behavior under concurrent agent load:
 * - Serial baseline (1 agent, 1 pipeline)
 * - Light concurrency (4 agents, 2 pipelines)
 * - Full concurrency (8 agents, 4 pipelines)
 * - Burst (8 agents, 8 simultaneous pipelines)
 *
 * Task 0110 — EP16 E2E Testing & Load Characterization
 */

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
  createPipelineHarness,
  nextCallId,
  PIPELINE_STAGES,
  type PipelineHarness,
} from '../e2e/helpers/pipeline-harness.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BenchmarkMetrics {
  scenario: string;
  pipelines: number;
  agents: number;
  totalOps: number;
  durationMs: number;
  opsPerSecond: number;
  avgWriteLatencyMs: number;
  p99WriteLatencyMs: number;
  avgMessageLatencyMs: number;
  p99MessageLatencyMs: number;
  memoryPeakMb: number;
  errors: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

async function runPipeline(
  harness: PipelineHarness,
  pipelineIndex: number,
  writeLatencies: number[],
  messageLatencies: number[],
): Promise<{ taskId: string; errors: number }> {
  const { tools, advanceToStage } = harness;
  let errors = 0;
  const stages = [...PIPELINE_STAGES].slice(0, -1); // exclude DONE from iteration
  const agents = ['pm', 'po', 'tech-lead', 'designer', 'back-1', 'qa', 'front-1', 'devops', 'pm'];

  // Start pipeline
  const t0 = performance.now();
  let startResult: unknown;
  try {
    startResult = await tools.pipelineStart.execute(nextCallId(), {
      ideaText: `Benchmark pipeline ${pipelineIndex}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Pipeline ${pipelineIndex} start failed: ${msg}`);
    errors++;
    return { taskId: '', errors };
  }
  writeLatencies.push(performance.now() - t0);

  const { taskId } = (startResult as { details: { taskId: string } }).details;

  // Advance through all stages with messages
  for (let i = 1; i < stages.length; i++) {
    const stage = stages[i]!;
    const fromAgent = agents[i - 1] ?? 'pm';
    const toAgent = agents[i] ?? 'po';

    // Advance stage
    const tw = performance.now();
    try {
      advanceToStage(taskId, stage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Pipeline ${pipelineIndex} advance to ${stage} failed: ${msg}`);
      errors++;
      continue;
    }
    writeLatencies.push(performance.now() - tw);

    // Send cross-agent message
    const tm = performance.now();
    try {
      await tools.teamMessage.execute(nextCallId(), {
        from: fromAgent,
        to: toAgent,
        subject: `Stage ${stage} handoff (pipeline ${pipelineIndex})`,
        body: `Advancing to ${stage}`,
        taskRef: taskId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Pipeline ${pipelineIndex} message ${fromAgent}→${toAgent} failed: ${msg}`);
      errors++;
    }
    messageLatencies.push(performance.now() - tm);
  }

  // Final advance to DONE
  const tf = performance.now();
  try {
    advanceToStage(taskId, 'DONE');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Pipeline ${pipelineIndex} final DONE advance failed: ${msg}`);
    errors++;
  }
  writeLatencies.push(performance.now() - tf);

  return { taskId, errors };
}

function collectMemoryMb(): number {
  const mem = process.memoryUsage();
  return Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe('Concurrent Agent Load Benchmark', () => {
  const results: BenchmarkMetrics[] = [];
  const harnesses: PipelineHarness[] = [];

  afterEach(() => {
    for (const h of harnesses) h.cleanup();
    harnesses.length = 0;
  });

  async function runScenario(
    name: string,
    pipelineCount: number,
    agentCount: number,
    parallel: boolean,
  ): Promise<BenchmarkMetrics> {
    const harness = createPipelineHarness();
    harnesses.push(harness);

    const writeLatencies: number[] = [];
    const messageLatencies: number[] = [];
    let totalErrors = 0;

    const memBefore = collectMemoryMb();
    const start = performance.now();

    if (parallel) {
      // Run all pipelines concurrently
      const promises = Array.from({ length: pipelineCount }, (_, i) =>
        runPipeline(harness, i, writeLatencies, messageLatencies),
      );
      const results = await Promise.all(promises);
      for (const r of results) totalErrors += r.errors;
    } else {
      // Run pipelines sequentially
      for (let i = 0; i < pipelineCount; i++) {
        const r = await runPipeline(harness, i, writeLatencies, messageLatencies);
        totalErrors += r.errors;
      }
    }

    const durationMs = performance.now() - start;
    const memAfter = collectMemoryMb();
    const memPeak = Math.max(memBefore, memAfter);

    const sortedWrites = [...writeLatencies].sort((a, b) => a - b);
    const sortedMessages = [...messageLatencies].sort((a, b) => a - b);
    const totalOps = writeLatencies.length + messageLatencies.length;

    const metrics: BenchmarkMetrics = {
      scenario: name,
      pipelines: pipelineCount,
      agents: agentCount,
      totalOps,
      durationMs: Math.round(durationMs * 100) / 100,
      opsPerSecond: Math.round((totalOps / (durationMs / 1000)) * 100) / 100,
      avgWriteLatencyMs: Math.round((sortedWrites.reduce((s, v) => s + v, 0) / sortedWrites.length) * 100) / 100,
      p99WriteLatencyMs: Math.round(percentile(sortedWrites, 99) * 100) / 100,
      avgMessageLatencyMs: Math.round((sortedMessages.reduce((s, v) => s + v, 0) / sortedMessages.length) * 100) / 100,
      p99MessageLatencyMs: Math.round(percentile(sortedMessages, 99) * 100) / 100,
      memoryPeakMb: memPeak,
      errors: totalErrors,
    };

    results.push(metrics);
    return metrics;
  }

  it('Scenario 1: Serial baseline — 1 pipeline, sequential', async () => {
    const m = await runScenario('Serial baseline', 1, 1, false);
    expect(m.errors).toBe(0);
    expect(m.totalOps).toBeGreaterThan(0);
    expect(m.durationMs).toBeLessThan(5000);
  });

  it('Scenario 2: Light concurrency — 2 pipelines, parallel', async () => {
    const m = await runScenario('Light concurrency', 2, 4, true);
    expect(m.errors).toBe(0);
    expect(m.totalOps).toBeGreaterThan(0);
    expect(m.durationMs).toBeLessThan(10000);
  });

  it('Scenario 3: Full concurrency — 4 pipelines, parallel', async () => {
    const m = await runScenario('Full concurrency', 4, 8, true);
    expect(m.errors).toBe(0);
    expect(m.totalOps).toBeGreaterThan(0);
    expect(m.durationMs).toBeLessThan(15000);
  });

  it('Scenario 4: Burst — 8 simultaneous pipelines, parallel', async () => {
    const m = await runScenario('Burst', 8, 8, true);
    expect(m.errors).toBe(0);
    expect(m.totalOps).toBeGreaterThan(0);
    expect(m.durationMs).toBeLessThan(30000);

    // After all scenarios, output a summary
    console.log('\n=== Concurrent Load Benchmark Results ===\n');
    console.log('| Scenario | Pipelines | Ops | Duration (ms) | Ops/s | Avg Write (ms) | P99 Write (ms) | Avg Msg (ms) | P99 Msg (ms) | Memory (MB) | Errors |');
    console.log('|----------|-----------|-----|---------------|-------|----------------|----------------|--------------|--------------|-------------|--------|');
    for (const r of results) {
      console.log(
        `| ${r.scenario} | ${r.pipelines} | ${r.totalOps} | ${r.durationMs} | ${r.opsPerSecond} | ${r.avgWriteLatencyMs} | ${r.p99WriteLatencyMs} | ${r.avgMessageLatencyMs} | ${r.p99MessageLatencyMs} | ${r.memoryPeakMb} | ${r.errors} |`,
      );
    }
    console.log('');

    // Write machine-readable results for perf-compare
    const serial = results.find((r) => r.scenario === 'Serial baseline');
    const burst = results.find((r) => r.scenario === 'Burst');
    if (serial && burst) {
      const currentResults = {
        serial_duration_ms: serial.durationMs,
        serial_ops_per_second: serial.opsPerSecond,
        burst_p99_write_ms: burst.p99WriteLatencyMs,
        burst_p99_message_ms: burst.p99MessageLatencyMs,
        burst_memory_mb: burst.memoryPeakMb,
      };
      const outPath = resolve(import.meta.dirname, '../../../../docs/benchmarks/current.json');
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(currentResults, null, 2) + '\n');
      console.log(`Benchmark results written to ${outPath}`);
    }
  });
});
