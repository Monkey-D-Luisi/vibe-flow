#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { runTests } from '../src/tools/run_tests.js';
import { coverageReport } from '../src/tools/coverage_report.js';
import { lint } from '../src/tools/lint.js';
import { complexity } from '../src/tools/complexity.js';
import type { CoverageReportInput } from '../src/tools/coverage_report.js';
import type { LintInput } from '../src/tools/lint.js';
import type { ComplexityInput } from '../src/tools/complexity.js';

const MIN_TIMEOUT_MS = 1000;

function ensureValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseCoverageArgs(args: string[]): CoverageReportInput {
  const options: CoverageReportInput = {};
  for (let i = 2; i < args.length; i += 1) {
    const flag = args[i];
    switch (flag) {
      case '--summary':
        options.summaryPath = ensureValue(args, ++i, '--summary');
        break;
      case '--lcov':
        options.lcovPath = ensureValue(args, ++i, '--lcov');
        break;
      case '--repo':
      case '--repo-root':
        options.repoRoot = ensureValue(args, ++i, flag);
        break;
      case '--exclude': {
        const value = ensureValue(args, ++i, '--exclude');
        options.exclude = [...(options.exclude ?? []), value];
        break;
      }
      default:
        throw new Error(`Unknown option ${flag}`);
    }
  }
  return options;
}

function parseLintArgs(args: string[]): LintInput {
  const options: LintInput = {};
  for (let i = 2; i < args.length; i += 1) {
    const flag = args[i];
    switch (flag) {
      case '--tool': {
        const value = ensureValue(args, ++i, '--tool');
        if (value !== 'eslint' && value !== 'ruff') {
          throw new Error(`Unsupported lint tool ${value}`);
        }
        options.tool = value;
        break;
      }
      case '--cmd':
        options.cmd = ensureValue(args, ++i, '--cmd');
        break;
      case '--cwd':
        options.cwd = ensureValue(args, ++i, '--cwd');
        break;
      case '--timeout':
      case '--timeout-ms': {
        const raw = ensureValue(args, ++i, flag);
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < 1000) {
          throw new Error(`Invalid timeout value ${raw}`);
        }
        options.timeoutMs = parsed;
        break;
      }
      case '--env': {
        const value = ensureValue(args, ++i, '--env');
        options.envAllow = [...(options.envAllow ?? []), value];
        break;
      }
      case '--path':
      case '--paths': {
        const value = ensureValue(args, ++i, flag);
        options.paths = [...(options.paths ?? []), value];
        break;
      }
      default:
        throw new Error(`Unknown option ${flag}`);
    }
  }
  return options;
}

function parseComplexityArgs(args: string[]): ComplexityInput {
  const options: ComplexityInput = {};
  for (let i = 2; i < args.length; i += 1) {
    const flag = args[i];
    switch (flag) {
      case '--engine': {
        const value = ensureValue(args, ++i, '--engine');
        if (value !== 'escomplex' && value !== 'tsmorph') {
          throw new Error(`Unsupported complexity engine ${value}`);
        }
        options.engine = value;
        break;
      }
      case '--glob':
      case '--globs': {
        const value = ensureValue(args, ++i, flag);
        options.globs = [...(options.globs ?? []), value];
        break;
      }
      case '--repo':
      case '--repo-root':
        options.repoRoot = ensureValue(args, ++i, flag);
        break;
      case '--exclude': {
        const value = ensureValue(args, ++i, '--exclude');
        options.exclude = [...(options.exclude ?? []), value];
        break;
      }
      case '--timeout':
      case '--timeout-ms': {
        const raw = ensureValue(args, ++i, flag);
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < MIN_TIMEOUT_MS) {
          throw new Error(`Invalid timeout value ${raw}`);
        }
        options.timeoutMs = parsed;
        break;
      }
      default:
        throw new Error(`Unknown option ${flag}`);
    }
  }
  return options;
}

function usage(): never {
  console.log(`Usage:
  qcli run --tests
  qcli run --coverage [--summary <path>] [--lcov <path>] [--repo <path>] [--exclude <glob>]
  qcli run --lint [--tool <eslint|ruff>] [--cmd <command>] [--cwd <path>] [--timeout <ms>] [--env <VAR>] [--path <glob>]
  qcli run --complexity [--engine <escomplex|tsmorph>] [--glob <pattern>]... [--repo <path>] [--exclude <glob>] [--timeout <ms>]`);
  process.exit(1);
}

async function handleTests(): Promise<never> {
  const result = await runTests({});
  const outputPath = '.qreport/tests.json';
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Test report saved to ${outputPath}`);
  const exitCode = result.meta?.exitCode ?? 0;
  if (exitCode !== 0) {
    console.error(`Tests finished with exit code ${exitCode}`);
  }
  process.exit(exitCode);
}

async function handleCoverage(args: string[]): Promise<never> {
  const options = parseCoverageArgs(args);
  const result = await coverageReport(options);
  const outputPath = '.qreport/coverage.json';
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Coverage report saved to ${outputPath}`);
  process.exit(0);
}

async function handleLint(args: string[]): Promise<never> {
  const options = parseLintArgs(args);
  const result = await lint(options);
  const outputPath = '.qreport/lint.json';
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Lint report saved to ${outputPath}`);
  const exitCode = result.meta?.exitCode ?? 0;
  if (exitCode !== 0) {
    console.error(`Lint finished with exit code ${exitCode}`);
  }
  process.exit(exitCode);
}

async function handleComplexity(args: string[]): Promise<never> {
  const options = parseComplexityArgs(args);
  const result = await complexity(options);
  const outputPath = '.qreport/complexity.json';
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Complexity report saved to ${outputPath}`);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] !== 'run') {
    usage();
  }

  try {
    if (args[1] === '--tests') {
      await handleTests();
    } else if (args[1] === '--coverage') {
      await handleCoverage(args);
    } else if (args[1] === '--lint') {
      await handleLint(args);
    } else if (args[1] === '--complexity') {
      await handleComplexity(args);
    } else {
      usage();
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
