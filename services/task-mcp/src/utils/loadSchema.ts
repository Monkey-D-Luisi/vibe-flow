import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemasRoot = resolve(__dirname, '../../../../packages/schemas');
const cache = new Map<string, Record<string, unknown>>();

export function loadSchema(schemaFile: string): Record<string, unknown> {
  const cached = cache.get(schemaFile);
  if (cached) {
    return cached;
  }

  const schemaPath = resolve(schemasRoot, schemaFile);
  const raw = readFileSync(schemaPath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  cache.set(schemaFile, parsed);
  return parsed;
}
