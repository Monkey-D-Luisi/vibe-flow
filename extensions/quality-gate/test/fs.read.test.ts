import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn(),
  },
}));

import { promises as fsp } from 'node:fs';
import { readJsonFile, MAX_JSON_FILE_BYTES } from '@openclaw/quality-contracts/fs/read';

const mockStat = vi.mocked(fsp.stat);
const mockReadFile = vi.mocked(fsp.readFile);

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
