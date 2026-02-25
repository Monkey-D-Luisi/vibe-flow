#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_SCRIPTS: Record<string, string> = {
  'q:gate': 'tsx scripts/run-root-q-gate.ts',
  'q:tests': 'pnpm --filter @openclaw/quality-gate q:cli run --tests',
  'q:coverage': 'pnpm --filter @openclaw/quality-gate q:cli run --coverage',
  'q:lint': 'pnpm --filter @openclaw/quality-gate q:cli run --lint',
  'q:complexity': 'pnpm --filter @openclaw/quality-gate q:cli run --complexity',
};

function fail(message: string): never {
  throw new Error(message);
}

function main(): void {
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const wrapperPath = resolve(process.cwd(), 'scripts/run-root-q-gate.ts');

  if (!existsSync(packageJsonPath)) {
    fail(`Missing package manifest: ${packageJsonPath}`);
  }

  if (!existsSync(wrapperPath)) {
    fail(`Missing root gate wrapper: ${wrapperPath}`);
  }

  const raw = readFileSync(packageJsonPath, 'utf8');
  const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
  const scripts = parsed.scripts;
  if (!scripts || typeof scripts !== 'object') {
    fail('package.json does not define scripts');
  }

  for (const [scriptName, expectedCommand] of Object.entries(REQUIRED_SCRIPTS)) {
    const actualCommand = scripts[scriptName];
    if (!actualCommand) {
      fail(`Missing required root script "${scriptName}"`);
    }
    if (actualCommand !== expectedCommand) {
      fail(
        `Root script "${scriptName}" drifted.\nExpected: ${expectedCommand}\nActual:   ${actualCommand}`,
      );
    }
  }

  console.log('Root quality-gate command surface verified.');
}

main();
