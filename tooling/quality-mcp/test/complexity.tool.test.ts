import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { complexity } from '../src/tools/complexity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

describe('complexity tool', () => {
  it('aggregates cyclomatic metrics across files using escomplex', async () => {
    const result = await complexity({
      globs: ['test/fixtures/complexity/*.ts'],
      repoRoot,
      exclude: [],
      engine: 'escomplex'
    });

    expect(result.meta.engine).toBe('escomplex');
    expect(result.files.length).toBe(2);
    expect(result.avgCyclomatic).toBeGreaterThan(0);
    expect(result.maxCyclomatic).toBeGreaterThan(0);

    const firstFile = result.files.find((file) => file.path.endsWith('simple.ts'));
    expect(firstFile).toBeDefined();
    expect(firstFile?.units.length).toBeGreaterThan(0);
  });

  it('respects exclusions and supports ts-morph engine', async () => {
    const result = await complexity({
      globs: ['test/fixtures/complexity/*.ts'],
      repoRoot,
      exclude: ['**/advanced.ts'],
      engine: 'tsmorph'
    });

    expect(result.meta.engine).toBe('tsmorph');
    expect(result.files.length).toBe(1);
    expect(result.files[0]?.path.endsWith('simple.ts')).toBe(true);
  });
});
