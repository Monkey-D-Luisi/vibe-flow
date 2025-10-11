import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyzeWithEscomplex } from '../src/complexity/escomplex.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('analyzeWithEscomplex', () => {
  it('extracts class and function units with cyclomatic metrics', async () => {
    const filePath = resolve(__dirname, 'fixtures', 'complexity', 'simple.ts');
    const result = await analyzeWithEscomplex(filePath);

    const classUnit = result.units.find((unit) => unit.kind === 'class' && unit.name === 'Greeter');
    const greetUnit = result.units.find((unit) => unit.name === 'greet');
    const normalizeUnit = result.units.find((unit) => unit.kind === 'arrow');

    expect(classUnit).toBeDefined();
    expect(classUnit?.cyclomatic).toBeGreaterThanOrEqual(1);
    expect(greetUnit?.cyclomatic).toBeGreaterThanOrEqual(2);
    expect(normalizeUnit?.kind).toBe('arrow');
  });
});
