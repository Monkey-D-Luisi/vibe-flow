import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSafe, readJsonFile, MAX_JSON_FILE_BYTES } from '../../src/fs/read.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'qc-read-test-'));
}

describe('readFileSafe', () => {
  it('reads an existing file', async () => {
    const dir = createTempDir();
    const file = join(dir, 'test.txt');
    writeFileSync(file, 'hello world');
    const result = await readFileSafe(file);
    expect(result).toBe('hello world');
    rmSync(dir, { recursive: true });
  });

  it('throws NOT_FOUND for missing file', async () => {
    await expect(readFileSafe('/nonexistent/path/file.txt')).rejects.toThrow('NOT_FOUND');
  });
});

describe('readJsonFile', () => {
  it('parses valid JSON from file', async () => {
    const dir = createTempDir();
    const file = join(dir, 'data.json');
    writeFileSync(file, JSON.stringify({ key: 'value', num: 42 }));
    const result = await readJsonFile<{ key: string; num: number }>(file);
    expect(result.key).toBe('value');
    expect(result.num).toBe(42);
    rmSync(dir, { recursive: true });
  });

  it('throws NOT_FOUND for missing file', async () => {
    await expect(readJsonFile('/missing/file.json')).rejects.toThrow('NOT_FOUND');
  });

  it('throws PARSE_ERROR for invalid JSON', async () => {
    const dir = createTempDir();
    const file = join(dir, 'bad.json');
    writeFileSync(file, 'not-valid-json{{{');
    await expect(readJsonFile(file)).rejects.toThrow('PARSE_ERROR');
    rmSync(dir, { recursive: true });
  });

  it('exports MAX_JSON_FILE_BYTES constant (50 MB)', () => {
    expect(MAX_JSON_FILE_BYTES).toBe(50 * 1024 * 1024);
  });
});
