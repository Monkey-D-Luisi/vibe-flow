#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const VALID_SCOPES = new Set(['major', 'minor', 'patch', 'default']);
const VALID_SOURCES = new Set(['artifacts']);

interface ParsedArgs {
  source?: string;
  scope?: string;
  passthrough: string[];
  helpRequested: boolean;
}

function expectValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    passthrough: [],
    helpRequested: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      parsed.helpRequested = true;
      continue;
    }

    if (token === '--source') {
      const source = expectValue(argv, ++i, '--source');
      if (!VALID_SOURCES.has(source)) {
        throw new Error(`Invalid source "${source}". Valid values: ${[...VALID_SOURCES].join(', ')}`);
      }
      parsed.source = source;
      continue;
    }

    if (token === '--scope') {
      const scope = expectValue(argv, ++i, '--scope');
      if (!VALID_SCOPES.has(scope)) {
        throw new Error(`Invalid scope "${scope}". Valid values: ${[...VALID_SCOPES].join(', ')}`);
      }
      parsed.scope = scope;
      continue;
    }

    if (token === '--') {
      parsed.passthrough.push(...argv.slice(i + 1));
      break;
    }

    parsed.passthrough.push(token);
  }

  return parsed;
}

function printUsage(): void {
  console.log(`Usage:
  pnpm q:gate --source artifacts --scope <major|minor|patch|default>
  pnpm q:gate --scope <major|minor|patch|default>

Notes:
  --source artifacts is accepted for root command-compatibility and normalized
  before delegating to @openclaw/quality-gate q:cli.`);
}

function runDelegatedGate(scope: string | undefined, passthrough: string[]): number {
  const args = ['--filter', '@openclaw/quality-gate', 'q:cli', 'run', '--gate'];
  if (scope) {
    args.push('--scope', scope);
  }
  args.push(...passthrough);

  const result = spawnSync('pnpm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number') {
    return result.status;
  }

  return 1;
}

function main(): void {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.helpRequested) {
      printUsage();
      process.exit(0);
    }

    const exitCode = runDelegatedGate(parsed.scope, parsed.passthrough);
    process.exit(exitCode);
  } catch (error) {
    console.error(`q:gate wrapper error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
