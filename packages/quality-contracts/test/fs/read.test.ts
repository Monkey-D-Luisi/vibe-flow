import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSafe, readJsonFile, MAX_JSON_FILE_BYTES } from '../../src/fs/read.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qc-read-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('readFileSafe', () => {
  it('reads an existing file', async () => {
    const dir = createTempDir();
    const file = join(dir, 'test.txt');
    writeFileSync(file, 'hello world');
    const result = await readFileSafe(file);
    expect(result).toBe('hello world');
  });

  it('throws NOT_FOUND for missing file', async () => {
    const dir = createTempDir();
    const missing = join(dir, 'does-not-exist.txt');
    await expect(readFileSafe(missing)).rejects.toThrow('NOT_FOUND');
  });

  it('reads a file when root is provided and path is contained', async () => {
    const dir = createTempDir();
    const file = join(dir, 'safe.txt');
    writeFileSync(file, 'safe content');
    const result = await readFileSafe(file, dir);
    expect(result).toBe('safe content');
  });

  it('throws PATH_TRAVERSAL when path escapes root', async () => {
    const dir = createTempDir();
    const escapedPath = join(dir, '..', '..', 'etc', 'passwd');
    await expect(readFileSafe(escapedPath, dir)).rejects.toThrow('PATH_TRAVERSAL');
  });

  it('does not validate path when root is omitted', async () => {
    const dir = createTempDir();
    const file = join(dir, 'test.txt');
    writeFileSync(file, 'no root check');
    const result = await readFileSafe(file);
    expect(result).toBe('no root check');
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
  });

  it('throws NOT_FOUND for missing file', async () => {
    const dir = createTempDir();
    const missing = join(dir, 'missing.json');
    await expect(readJsonFile(missing)).rejects.toThrow('NOT_FOUND');
  });

  it('throws PARSE_ERROR for invalid JSON', async () => {
    const dir = createTempDir();
    const file = join(dir, 'bad.json');
    writeFileSync(file, 'not-valid-json{{{');
    await expect(readJsonFile(file)).rejects.toThrow('PARSE_ERROR');
  });

  it('exports MAX_JSON_FILE_BYTES constant (50 MB)', () => {
    expect(MAX_JSON_FILE_BYTES).toBe(50 * 1024 * 1024);
  });

  it('parses valid JSON when root is provided and path is contained', async () => {
    const dir = createTempDir();
    const file = join(dir, 'safe.json');
    writeFileSync(file, JSON.stringify({ safe: true }));
    const result = await readJsonFile<{ safe: boolean }>(file, dir);
    expect(result.safe).toBe(true);
  });

  it('throws PATH_TRAVERSAL when path escapes root', async () => {
    const dir = createTempDir();
    const escapedPath = join(dir, '..', '..', 'etc', 'secret.json');
    await expect(readJsonFile(escapedPath, dir)).rejects.toThrow('PATH_TRAVERSAL');
  });
});
