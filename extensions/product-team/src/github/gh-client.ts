import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertSafeCommand, safeSpawn } from './spawn.js';

export interface GhClientConfig {
  readonly owner: string;
  readonly repo: string;
  readonly timeoutMs?: number;
  readonly cwd?: string;
}

export interface GhCommandErrorDetails {
  readonly code: 'GH_TIMEOUT' | 'GH_COMMAND_FAILED' | 'GH_INVALID_JSON';
  readonly command: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

export class GhCommandError extends Error {
  readonly details: GhCommandErrorDetails;

  constructor(message: string, details: GhCommandErrorDetails) {
    super(message);
    this.name = 'GhCommandError';
    this.details = details;
  }
}

interface GitRefResponse {
  readonly ref: string;
  readonly object: {
    readonly sha: string;
  };
}

export interface GhPullRequestSummary {
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly state?: string;
}

export interface GhCreatePrInput {
  readonly head: string;
  readonly base: string;
  readonly title: string;
  readonly body: string;
  readonly labels: string[];
  readonly draft: boolean;
}

export interface GhUpdatePrInput {
  readonly number: number;
  readonly title?: string;
  readonly body?: string;
  readonly labels?: string[];
  readonly state?: 'open' | 'closed';
}

interface GhResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

function commandToString(args: string[]): string {
  return `gh ${args.join(' ')}`.trim();
}

function toGhError(
  code: GhCommandErrorDetails['code'],
  args: string[],
  result: GhResult,
  message: string,
): GhCommandError {
  return new GhCommandError(message, {
    code,
    command: commandToString(args),
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated,
  });
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

async function withBodyFile<T>(body: string, fn: (bodyFilePath: string) => Promise<T>): Promise<T> {
  const tempDir = await mkdtemp(join(tmpdir(), 'openclaw-pr-body-'));
  const filePath = join(tempDir, 'body.md');
  await writeFile(filePath, body, 'utf8');
  try {
    return await fn(toPosixPath(filePath));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export class GhClient {
  private readonly timeoutMs: number;

  constructor(private readonly config: GhClientConfig) {
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  private async run(args: string[]): Promise<GhResult> {
    assertSafeCommand('gh', args);
    const result = await safeSpawn('gh', args, {
      timeoutMs: this.timeoutMs,
      cwd: this.config.cwd,
      envAllow: ['NODE_ENV', 'GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST'],
    });
    if (result.timedOut) {
      throw toGhError(
        'GH_TIMEOUT',
        args,
        result,
        `GitHub command timed out after ${this.timeoutMs}ms`,
      );
    }
    if (result.exitCode !== 0) {
      throw toGhError(
        'GH_COMMAND_FAILED',
        args,
        result,
        `GitHub command failed with exit code ${result.exitCode}`,
      );
    }
    return result;
  }

  private async runJson<T>(args: string[]): Promise<T> {
    const result = await this.run(args);
    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      throw toGhError(
        'GH_INVALID_JSON',
        args,
        result,
        'GitHub command returned invalid JSON output',
      );
    }
  }

  async getBranchSha(branch: string): Promise<string> {
    const result = await this.run([
      'api',
      `repos/${this.config.owner}/${this.config.repo}/git/ref/heads/${branch}`,
      '--jq',
      '.object.sha',
    ]);
    return result.stdout.trim();
  }

  async createBranch(name: string, baseSha: string): Promise<{ ref: string; sha: string }> {
    const response = await this.runJson<GitRefResponse>([
      'api',
      '--method',
      'POST',
      `repos/${this.config.owner}/${this.config.repo}/git/refs`,
      '-f',
      `ref=refs/heads/${name}`,
      '-f',
      `sha=${baseSha}`,
    ]);
    return {
      ref: response.ref,
      sha: response.object.sha,
    };
  }

  async createPr(input: GhCreatePrInput): Promise<GhPullRequestSummary> {
    return withBodyFile(input.body, async (bodyFilePath) => {
      const args: string[] = [
        'pr',
        'create',
        '--repo',
        `${this.config.owner}/${this.config.repo}`,
        '--head',
        input.head,
        '--base',
        input.base,
        '--title',
        input.title,
        '--body-file',
        bodyFilePath,
        '--json',
        'number,url,title',
      ];

      if (input.draft) {
        args.push('--draft');
      }
      for (const label of input.labels) {
        args.push('--label', label);
      }

      return this.runJson<GhPullRequestSummary>(args);
    });
  }

  async updatePr(input: GhUpdatePrInput): Promise<GhPullRequestSummary> {
    if (input.title || input.body || (input.labels && input.labels.length > 0)) {
      const withBody = async (bodyFilePath?: string): Promise<void> => {
        const args: string[] = [
          'pr',
          'edit',
          String(input.number),
          '--repo',
          `${this.config.owner}/${this.config.repo}`,
        ];

        if (input.title) {
          args.push('--title', input.title);
        }
        if (bodyFilePath) {
          args.push('--body-file', bodyFilePath);
        }
        for (const label of input.labels ?? []) {
          args.push('--add-label', label);
        }

        await this.run(args);
      };

      if (input.body !== undefined) {
        await withBodyFile(input.body, (bodyFilePath) => withBody(bodyFilePath));
      } else {
        await withBody();
      }
    }

    if (input.state === 'closed') {
      await this.run([
        'pr',
        'close',
        String(input.number),
        '--repo',
        `${this.config.owner}/${this.config.repo}`,
      ]);
    } else if (input.state === 'open') {
      await this.run([
        'pr',
        'reopen',
        String(input.number),
        '--repo',
        `${this.config.owner}/${this.config.repo}`,
      ]);
    }

    return this.runJson<GhPullRequestSummary>([
      'pr',
      'view',
      String(input.number),
      '--repo',
      `${this.config.owner}/${this.config.repo}`,
      '--json',
      'number,url,title,state',
    ]);
  }

  async syncLabel(name: string, color: string, description: string): Promise<void> {
    await this.run([
      'label',
      'create',
      name,
      '--repo',
      `${this.config.owner}/${this.config.repo}`,
      '--color',
      color,
      '--description',
      description,
      '--force',
    ]);
  }

  async requestReviewers(prNumber: number, reviewers: string[]): Promise<void> {
    if (reviewers.length === 0) {
      return;
    }

    const args: string[] = [
      'pr',
      'edit',
      String(prNumber),
      '--repo',
      `${this.config.owner}/${this.config.repo}`,
    ];

    for (const reviewer of reviewers) {
      args.push('--add-reviewer', reviewer);
    }

    await this.run(args);
  }

  async commentPr(prNumber: number, body: string): Promise<void> {
    await withBodyFile(body, async (bodyFilePath) => {
      await this.run([
        'pr',
        'comment',
        String(prNumber),
        '--repo',
        `${this.config.owner}/${this.config.repo}`,
        '--body-file',
        bodyFilePath,
      ]);
    });
  }
}
