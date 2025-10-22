import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.resolve(__dirname, 'design-ready.schema.json');

let cachedSchema: Record<string, unknown> | null = null;

export async function loadSchema(): Promise<Record<string, unknown>> {
  if (cachedSchema) {
    return cachedSchema;
  }

  const raw = await fs.readFile(schemaPath, 'utf8');
  cachedSchema = JSON.parse(raw);
  return cachedSchema;
}

export async function createValidator(): Promise<ValidateFunction> {
  const schema = await loadSchema();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}
