#!/usr/bin/env node
import { resolve } from 'node:path';
import { generateExtension } from './generator.js';
import { VALID_TEMPLATES, isValidTemplate } from './templates.js';
import type { TemplateType } from './templates.js';

function printUsage(): void {
  process.stderr.write(
    'Usage: pnpm create:extension <name> [--template <type>] [--force]\n' +
      '  name       Kebab-case extension name (e.g. my-plugin)\n' +
      `  --template Template type: ${VALID_TEMPLATES.join(', ')} (default: hybrid)\n` +
      '  --force    Overwrite existing directory\n',
  );
}

function parseTemplate(argv: string[]): TemplateType {
  const idx = argv.indexOf('--template');
  if (idx === -1) return 'hybrid';
  const value = argv[idx + 1];
  if (!value || !isValidTemplate(value)) {
    process.stderr.write(
      `Invalid template "${value ?? ''}". Valid templates: ${VALID_TEMPLATES.join(', ')}\n`,
    );
    process.exit(1);
  }
  return value;
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const force = argv.includes('--force');
  const template = parseTemplate(argv);
  const positional = argv.filter((a) => !a.startsWith('--') && !VALID_TEMPLATES.includes(a as TemplateType));

  if (positional.length !== 1) {
    printUsage();
    process.exit(1);
  }

  const name = positional[0] as string;
  const targetDir = resolve(process.cwd(), 'extensions', name);

  try {
    generateExtension({ name, targetDir, force, template });
    process.stdout.write(`Created extensions/${name} (template: ${template})\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main();
