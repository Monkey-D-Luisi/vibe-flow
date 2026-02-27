import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn(),
  },
}));

vi.mock('fast-glob', () => ({
  default: vi.fn().mockResolvedValue([]),
}));

import { promises as fsp } from 'node:fs';
import {
  filterByExclude,
  resolveGlobPatterns,
  readJsonFile,
  MAX_PATTERN_LENGTH,
  MAX_JSON_FILE_BYTES,
} from '../../src/quality/fs.js';

const mockStat = vi.mocked(fsp.stat);
const mockReadFile = vi.mocked(fsp.readFile);

describe('filterByExclude — pattern length guard', () => {
  it('exports MAX_PATTERN_LENGTH as 500', () => {
    expect(MAX_PATTERN_LENGTH).toBe(500);
  });

  it('returns true when no exclude patterns are given', () => {
    expect(filterByExclude('/src/foo.ts', [])).toBe(true);
  });

  it('filters a file matching an exclude pattern', () => {
    expect(filterByExclude('/src/foo.ts', ['**/*.ts'])).toBe(false);
  });

  it('keeps a file not matching any exclude pattern', () => {
    expect(filterByExclude('/src/foo.ts', ['**/*.js'])).toBe(true);
  });

  it('accepts exclude patterns exactly at the length limit', () => {
    const pattern = 'a'.repeat(MAX_PATTERN_LENGTH);
    expect(() => filterByExclude('/src/foo.ts', [pattern])).not.toThrow();
  });

  it('throws PATTERN_TOO_LONG when a pattern exceeds the limit', () => {
    const pattern = 'a'.repeat(MAX_PATTERN_LENGTH + 1);
    expect(() => filterByExclude('/src/foo.ts', [pattern])).toThrow('PATTERN_TOO_LONG');
  });
});

describe('resolveGlobPatterns — pattern length guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves without error when all exclude patterns are at the limit', async () => {
    const pattern = 'a'.repeat(MAX_PATTERN_LENGTH);
    await expect(
      resolveGlobPatterns(['**/*.ts'], { cwd: '/project', exclude: [pattern] }),
    ).resolves.toEqual([]);
  });

  it('throws PATTERN_TOO_LONG when an exclude pattern exceeds the limit', async () => {
    const pattern = 'a'.repeat(MAX_PATTERN_LENGTH + 1);
    await expect(
      resolveGlobPatterns(['**/*.ts'], { cwd: '/project', exclude: [pattern] }),
    ).rejects.toThrow('PATTERN_TOO_LONG');
  });
});

describe('readJsonFile — size guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports MAX_JSON_FILE_BYTES as 50 MB', () => {
    expect(MAX_JSON_FILE_BYTES).toBe(50 * 1024 * 1024);
  });

  it('parses a JSON file whose size equals the limit', async () => {
    mockStat.mockResolvedValue({ size: MAX_JSON_FILE_BYTES } as never);
    mockReadFile.mockResolvedValue('{"ok":true}' as never);

    const result = await readJsonFile<{ ok: boolean }>('/data/file.json');
    expect(result.ok).toBe(true);
  });

  it('throws FILE_TOO_LARGE when file size exceeds the limit', async () => {
    mockStat.mockResolvedValue({ size: MAX_JSON_FILE_BYTES + 1 } as never);

    await expect(readJsonFile('/data/huge.json')).rejects.toThrow('FILE_TOO_LARGE');
  });

  it('throws NOT_FOUND when the file does not exist', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockStat.mockRejectedValue(err);

    await expect(readJsonFile('/data/missing.json')).rejects.toThrow('NOT_FOUND');
  });

  it('throws PARSE_ERROR for invalid JSON', async () => {
    mockStat.mockResolvedValue({ size: 100 } as never);
    mockReadFile.mockResolvedValue('not json' as never);

    await expect(readJsonFile('/data/bad.json')).rejects.toThrow('PARSE_ERROR');
  });
});
