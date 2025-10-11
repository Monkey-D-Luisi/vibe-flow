import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyzeWithTsMorph } from '../src/complexity/tsmorph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('analyzeWithTsMorph', () => {
  it('detects arrow, function, and class members with computed cyclomatic values', async () => {
    const filePath = resolve(__dirname, 'fixtures', 'complexity', 'advanced.ts');
    const result = await analyzeWithTsMorph(filePath);

    const functionNames = result.units.map((unit) => unit.name);
    expect(functionNames).toContain('compare');
    expect(functionNames).toContain('compute');

    const compareUnit = result.units.find((unit) => unit.name === 'compare');
    expect(compareUnit?.kind).toBe('function');
    expect(compareUnit?.cyclomatic).toBeGreaterThanOrEqual(3);

    const computeUnit = result.units.find((unit) => unit.name === 'compute');
    expect(computeUnit?.cyclomatic).toBeGreaterThanOrEqual(3);
  });
});
