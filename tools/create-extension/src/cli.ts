#!/usr/bin/env node
import { resolve } from 'node:path';
import { generateExtension } from './generator.js';

function printUsage(): void {
  process.stderr.write(
    'Usage: pnpm create:extension <name> [--force]\n' +
      '  name     Kebab-case extension name (e.g. my-plugin)\n' +
      '  --force  Overwrite existing directory\n',
  );
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const force = argv.includes('--force');
  const positional = argv.filter((a) => !a.startsWith('--'));

  if (positional.length !== 1) {
    printUsage();
    process.exit(1);
  }

  const name = positional[0] as string;
  const targetDir = resolve(process.cwd(), 'extensions', name);

  try {
    generateExtension({ name, targetDir, force });
    process.stdout.write(`Created extensions/${name}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main();
