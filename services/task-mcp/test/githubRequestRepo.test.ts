import { beforeEach, describe, expect, it, vi } from 'vitest';
import { githubRequestRepo, repo } from '../src/mcp/tools/handlers/sharedRepos.js';

describe('GithubRequestRepository', () => {
  beforeEach(() => {
    repo.database.exec(`
      DELETE FROM github_requests;
    `);
  });

  it('stores and reuses responses by requestId', async () => {
    const responder = vi.fn().mockResolvedValue({ ok: true });
    const first = await githubRequestRepo.ensure('req-1', 'gh.test', { value: 1 }, responder);
    expect(first).toEqual({ ok: true });
    expect(responder).toHaveBeenCalledTimes(1);

    const second = await githubRequestRepo.ensure('req-1', 'gh.test', { value: 1 }, responder);
    expect(second).toEqual({ ok: true });
    expect(responder).toHaveBeenCalledTimes(1);
  });

  it('throws when requestId reused with different payload', async () => {
    const responder = vi.fn().mockResolvedValue({ ok: true });
    await githubRequestRepo.ensure('req-2', 'gh.test', { value: 1 }, responder);

    await expect(
      githubRequestRepo.ensure('req-2', 'gh.test', { value: 2 }, responder)
    ).rejects.toThrow('Request req-2 already used for different payload');
  });
});
