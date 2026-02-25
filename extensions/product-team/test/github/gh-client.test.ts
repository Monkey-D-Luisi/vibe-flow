import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/spawn.js', () => ({
  assertSafeCommand: vi.fn(),
  safeSpawn: vi.fn(),
}));

import { safeSpawn } from '../../src/github/spawn.js';
import { GhClient, GhCommandError } from '../../src/github/gh-client.js';

const mockSafeSpawn = vi.mocked(safeSpawn);

function ok(stdout: string) {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    durationMs: 20,
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

describe('GhClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a branch via gh api and return parsed ref/sha', async () => {
    mockSafeSpawn.mockResolvedValueOnce(
      ok('{"ref":"refs/heads/task/TASK-1-feature","object":{"sha":"abc123"}}'),
    );

    const client = new GhClient({ owner: 'acme', repo: 'vibe' });
    const result = await client.createBranch('task/TASK-1-feature', 'base-sha');

    expect(result).toEqual({
      ref: 'refs/heads/task/TASK-1-feature',
      sha: 'abc123',
    });
    expect(mockSafeSpawn).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining([
        'api',
        '--method',
        'POST',
        'repos/acme/vibe/git/refs',
      ]),
      expect.any(Object),
    );
  });

  it('should create a PR using --body-file and labels', async () => {
    mockSafeSpawn.mockResolvedValueOnce(ok('{"number":10,"url":"https://example/pr/10","title":"Feature"}'));

    const client = new GhClient({ owner: 'acme', repo: 'vibe' });
    const result = await client.createPr({
      head: 'task/TASK-1-feature',
      base: 'main',
      title: 'Feature',
      body: 'Body content',
      labels: ['infra', 'automation'],
      draft: true,
    });

    expect(result.number).toBe(10);
    const args = mockSafeSpawn.mock.calls[0][1];
    expect(args).toContain('--body-file');
    expect(args).toContain('--label');
    expect(args).toContain('--draft');
  });

  it('should update PR and run close command when state is closed', async () => {
    mockSafeSpawn
      .mockResolvedValueOnce(ok('')) // pr edit
      .mockResolvedValueOnce(ok('')) // pr close
      .mockResolvedValueOnce(ok('{"number":20,"url":"https://example/pr/20","title":"Updated","state":"CLOSED"}')); // pr view

    const client = new GhClient({ owner: 'acme', repo: 'vibe' });
    const result = await client.updatePr({
      number: 20,
      title: 'Updated',
      state: 'closed',
    });

    expect(result.number).toBe(20);
    expect(mockSafeSpawn).toHaveBeenCalledTimes(3);
    const secondCallArgs = mockSafeSpawn.mock.calls[1][1];
    expect(secondCallArgs).toEqual(
      expect.arrayContaining(['pr', 'close', '20']),
    );
  });

  it('should throw structured GhCommandError when gh command fails', async () => {
    mockSafeSpawn.mockResolvedValueOnce({
      stdout: '',
      stderr: 'boom',
      exitCode: 1,
      durationMs: 10,
      timedOut: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    });

    const client = new GhClient({ owner: 'acme', repo: 'vibe' });
    try {
      await client.getBranchSha('main');
      throw new Error('expected getBranchSha to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(GhCommandError);
      expect((error as Error).message).toMatch(/exit code 1/);
    }
  });

  it('should throw GhCommandError when JSON output is invalid', async () => {
    mockSafeSpawn.mockResolvedValueOnce(ok('not-json'));

    const client = new GhClient({ owner: 'acme', repo: 'vibe' });
    await expect(
      client.createBranch('task/TASK-1-feature', 'base-sha'),
    ).rejects.toBeInstanceOf(GhCommandError);
  });

  it('should request reviewers using gh pr edit', async () => {
    mockSafeSpawn.mockResolvedValueOnce(ok(''));

    const client = new GhClient({ owner: 'acme', repo: 'vibe' });
    await client.requestReviewers(42, ['alice', 'bob']);

    const args = mockSafeSpawn.mock.calls[0][1];
    expect(args).toEqual(
      expect.arrayContaining(['pr', 'edit', '42', '--add-reviewer', 'alice', '--add-reviewer', 'bob']),
    );
  });

  it('should post PR comments using a body file', async () => {
    mockSafeSpawn.mockResolvedValueOnce(ok(''));

    const client = new GhClient({ owner: 'acme', repo: 'vibe' });
    await client.commentPr(42, 'Automated PR status');

    const args = mockSafeSpawn.mock.calls[0][1];
    expect(args).toEqual(
      expect.arrayContaining(['pr', 'comment', '42', '--body-file']),
    );
  });
});
