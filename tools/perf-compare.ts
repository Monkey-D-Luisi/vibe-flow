#!/usr/bin/env node

/**
 * Performance Comparison Script
 *
 * Compares current benchmark results against the stored baseline.
 * Exits with code 1 if any metric regresses beyond its threshold.
 *
 * Usage:
 *   tsx tools/perf-compare.ts [--baseline path/to/baseline.json] [--current path/to/current.json]
 *
 * If --current is omitted, runs benchmarks and captures output.
 *
 * Task 0112 — EP16
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface MetricEntry {
  readonly value: number;
  readonly description: string;
  readonly threshold_pct: number;
  readonly direction?: 'higher_is_better';
}

interface Baseline {
  readonly metrics: Record<string, MetricEntry>;
}

interface CurrentResults {
  readonly serial_duration_ms: number;
  readonly serial_ops_per_second: number;
  readonly burst_p99_write_ms: number;
  readonly burst_p99_message_ms: number;
  readonly burst_memory_mb: number;
}

function parseArgs(argv: string[]): { baseline: string; current: string } {
  let baseline = resolve('docs/benchmarks/baseline.json');
  let current = '';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--baseline' && argv[i + 1]) {
      baseline = resolve(argv[++i]!);
    } else if (argv[i] === '--current' && argv[i + 1]) {
      current = resolve(argv[++i]!);
    }
  }

  return { baseline, current };
}

function loadBaseline(path: string): Baseline {
  if (!existsSync(path)) {
    throw new Error(`Baseline file not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as Baseline;
}

function loadCurrent(path: string): CurrentResults {
  if (!existsSync(path)) {
    throw new Error(`Current results file not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as CurrentResults;
}

function compareMetric(
  name: string,
  baselineEntry: MetricEntry,
  currentValue: number,
): { passed: boolean; delta: string; detail: string } {
  const { value: baselineValue, threshold_pct, direction } = baselineEntry;

  if (direction === 'higher_is_better') {
    // For ops/s: regression means current is BELOW (threshold_pct)% of baseline
    const threshold = baselineValue * (threshold_pct / 100);
    const ratio = baselineValue > 0 ? (currentValue / baselineValue) * 100 : 100;
    const passed = currentValue >= threshold;
    return {
      passed,
      delta: `${ratio.toFixed(0)}% of baseline`,
      detail: `${currentValue.toFixed(2)} vs baseline ${baselineValue.toFixed(2)} (min ${threshold.toFixed(2)})`,
    };
  }

  // For latency/duration/memory: regression means current EXCEEDS (threshold_pct)% of baseline
  const threshold = baselineValue * (threshold_pct / 100);
  const ratio = baselineValue > 0 ? (currentValue / baselineValue) * 100 : 100;
  const passed = currentValue <= threshold;
  return {
    passed,
    delta: `${ratio.toFixed(0)}% of baseline`,
    detail: `${currentValue.toFixed(2)} vs baseline ${baselineValue.toFixed(2)} (max ${threshold.toFixed(2)})`,
  };
}

function run(): void {
  const args = parseArgs(process.argv.slice(2));
  const baseline = loadBaseline(args.baseline);

  if (!args.current) {
    console.error('Error: --current <path> is required. Run benchmarks first and provide the JSON output.');
    console.error('Example: tsx tools/perf-compare.ts --current docs/benchmarks/current.json');
    process.exit(2);
  }

  const current = loadCurrent(args.current);

  const metricMap: Record<string, number> = {
    serial_duration_ms: current.serial_duration_ms,
    serial_ops_per_second: current.serial_ops_per_second,
    burst_p99_write_ms: current.burst_p99_write_ms,
    burst_p99_message_ms: current.burst_p99_message_ms,
    burst_memory_mb: current.burst_memory_mb,
  };

  console.log('\n=== Performance Comparison ===\n');
  console.log('| Metric | Current | Baseline | Delta | Status |');
  console.log('|--------|---------|----------|-------|--------|');

  let allPassed = true;

  for (const [name, entry] of Object.entries(baseline.metrics)) {
    const currentValue = metricMap[name];
    if (currentValue === undefined) {
      console.log(`| ${name} | MISSING | ${entry.value} | — | ⚠️ SKIP |`);
      continue;
    }

    const result = compareMetric(name, entry, currentValue);
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    if (!result.passed) allPassed = false;

    console.log(`| ${name} | ${currentValue.toFixed(2)} | ${entry.value.toFixed(2)} | ${result.delta} | ${status} |`);
  }

  console.log('');

  if (allPassed) {
    console.log('✅ All performance metrics within threshold.\n');
    process.exit(0);
  } else {
    console.log('❌ Performance regression detected!\n');
    process.exit(1);
  }
}

run();
