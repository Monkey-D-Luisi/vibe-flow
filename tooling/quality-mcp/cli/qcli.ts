#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { runTests } from '../src/tools/run_tests.js';
import { coverageReport } from '../src/tools/coverage_report.js';
import type { CoverageReportInput } from '../src/tools/coverage_report.js';

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

function usage(): never {
  console.log('Usage: qcli run --tests | qcli run --coverage [--summary <path>] [--lcov <path>] [--repo <path>] [--exclude <glob>]');
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
    } else {
      usage();
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
