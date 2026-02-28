import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fast-glob', () => ({
  default: vi.fn().mockResolvedValue([]),
}));

import { resolveGlobPatterns, MAX_PATTERN_LENGTH } from '@openclaw/quality-contracts/fs/glob';

describe('resolveGlobPatterns — pattern length guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports MAX_PATTERN_LENGTH as 500', () => {
    expect(MAX_PATTERN_LENGTH).toBe(500);
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

  it('resolves without error when there are no exclude patterns', async () => {
    await expect(
      resolveGlobPatterns(['**/*.ts'], { cwd: '/project' }),
    ).resolves.toEqual([]);
  });

  it('throws PATTERN_TOO_LONG for the first oversized pattern in a mixed list', async () => {
    const valid = 'node_modules/**';
    const oversized = 'b'.repeat(MAX_PATTERN_LENGTH + 1);
    await expect(
      resolveGlobPatterns(['**/*.ts'], { cwd: '/project', exclude: [valid, oversized] }),
    ).rejects.toThrow('PATTERN_TOO_LONG');
  });
});
