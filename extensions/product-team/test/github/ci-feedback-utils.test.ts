import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import {
  normalizeGithubCiEvent,
  buildCiStatusComment,
  buildTaskIdCandidatesFromBranch,
  readRequestBody,
  parseJsonRequestBody,
  readJsonRequestBody,
  RequestBodyTooLargeError,
  InvalidJsonPayloadError,
} from '../../src/github/ci-feedback-utils.js';

// ── Helper: create a readable stream from string/buffer ─────────────────────

function createRequest(body: string | Buffer): import('node:http').IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(typeof body === 'string' ? Buffer.from(body) : body);
      this.push(null);
    },
  });
  return readable as unknown as import('node:http').IncomingMessage;
}

function createEmptyRequest(): import('node:http').IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(null);
    },
  });
  return readable as unknown as import('node:http').IncomingMessage;
}

// ── normalizeGithubCiEvent ──────────────────────────────────────────────────

describe('normalizeGithubCiEvent', () => {
  it('returns null for unsupported event names', () => {
    expect(normalizeGithubCiEvent('push', {})).toBeNull();
    expect(normalizeGithubCiEvent('pull_request', {})).toBeNull();
    expect(normalizeGithubCiEvent('', {})).toBeNull();
  });

  describe('check_run events', () => {
    it('returns null when payload lacks check_run', () => {
      expect(normalizeGithubCiEvent('check_run', {})).toBeNull();
      expect(normalizeGithubCiEvent('check_run', { check_run: 'not-an-object' })).toBeNull();
      expect(normalizeGithubCiEvent('check_run', { check_run: null })).toBeNull();
      expect(normalizeGithubCiEvent('check_run', { check_run: [1, 2] })).toBeNull();
    });

    it('normalizes a complete check_run payload', () => {
      const result = normalizeGithubCiEvent('check_run', {
        action: 'completed',
        repository: { full_name: 'acme/vibe-flow' },
        check_run: {
          name: 'CI / test',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://ci.example/run/1',
          pull_requests: [{ number: 14 }],
          check_suite: { head_branch: 'task/TASK-100-fix' },
        },
      });

      expect(result).not.toBeNull();
      expect(result!.source).toBe('github');
      expect(result!.eventName).toBe('check_run');
      expect(result!.action).toBe('completed');
      expect(result!.repository).toBe('acme/vibe-flow');
      expect(result!.branch).toBe('task/TASK-100-fix');
      expect(result!.prNumber).toBe(14);
      expect(result!.overallConclusion).toBe('success');
      expect(result!.overallStatus).toBe('completed');
      expect(result!.runUrl).toBe('https://ci.example/run/1');
      expect(result!.checks).toHaveLength(1);
      expect(result!.checks[0].name).toBe('CI / test');
    });

    it('falls back to head_branch on check_run when check_suite is missing', () => {
      const result = normalizeGithubCiEvent('check_run', {
        action: 'completed',
        check_run: {
          name: 'CI / build',
          status: 'completed',
          conclusion: 'failure',
          html_url: null,
          head_branch: 'task/TASK-200-build',
        },
      });

      expect(result).not.toBeNull();
      expect(result!.branch).toBe('task/TASK-200-build');
    });

    it('handles missing optional fields gracefully', () => {
      const result = normalizeGithubCiEvent('check_run', {
        check_run: {
          name: '  ',
          status: null,
          conclusion: null,
          html_url: null,
        },
      });

      expect(result).not.toBeNull();
      // Empty/whitespace name falls back to 'check_run'
      expect(result!.checks[0].name).toBe('check_run');
      expect(result!.action).toBeNull();
      expect(result!.repository).toBeNull();
      expect(result!.branch).toBeNull();
      expect(result!.prNumber).toBeNull();
    });

    it('extracts PR number from pull_requests array', () => {
      const result = normalizeGithubCiEvent('check_run', {
        check_run: {
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          pull_requests: [{ number: 42 }],
        },
      });
      expect(result!.prNumber).toBe(42);
    });

    it('handles pull_requests with string number', () => {
      const result = normalizeGithubCiEvent('check_run', {
        check_run: {
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          pull_requests: [{ number: '55' }],
        },
      });
      expect(result!.prNumber).toBe(55);
    });

    it('returns null prNumber for empty pull_requests array', () => {
      const result = normalizeGithubCiEvent('check_run', {
        check_run: {
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          pull_requests: [],
        },
      });
      expect(result!.prNumber).toBeNull();
    });

    it('returns null prNumber when pull_requests contains non-objects', () => {
      const result = normalizeGithubCiEvent('check_run', {
        check_run: {
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          pull_requests: ['not-an-object', 42, null],
        },
      });
      expect(result!.prNumber).toBeNull();
    });

    it('returns null prNumber for pull_requests with invalid numbers', () => {
      const result = normalizeGithubCiEvent('check_run', {
        check_run: {
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          pull_requests: [{ number: -1 }, { number: 0 }],
        },
      });
      expect(result!.prNumber).toBeNull();
    });

    it('returns null prNumber when pull_requests is not an array', () => {
      const result = normalizeGithubCiEvent('check_run', {
        check_run: {
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          pull_requests: 'not-an-array',
        },
      });
      expect(result!.prNumber).toBeNull();
    });
  });

  describe('workflow_run events', () => {
    it('returns null when payload lacks workflow_run', () => {
      expect(normalizeGithubCiEvent('workflow_run', {})).toBeNull();
      expect(normalizeGithubCiEvent('workflow_run', { workflow_run: null })).toBeNull();
      expect(normalizeGithubCiEvent('workflow_run', { workflow_run: 'string' })).toBeNull();
    });

    it('normalizes a complete workflow_run payload', () => {
      const result = normalizeGithubCiEvent('workflow_run', {
        action: 'completed',
        repository: { full_name: 'acme/vibe-flow' },
        workflow_run: {
          name: 'CI Pipeline',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://ci.example/workflows/1',
          head_branch: 'task/TASK-300-deploy',
          pull_requests: [{ number: 88 }],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.eventName).toBe('workflow_run');
      expect(result!.branch).toBe('task/TASK-300-deploy');
      expect(result!.prNumber).toBe(88);
      expect(result!.checks[0].name).toBe('CI Pipeline');
    });

    it('handles missing workflow_run name (defaults to workflow_run)', () => {
      const result = normalizeGithubCiEvent('workflow_run', {
        workflow_run: {
          name: '  ',
          status: 'completed',
          conclusion: 'failure',
        },
      });

      expect(result).not.toBeNull();
      expect(result!.checks[0].name).toBe('workflow_run');
    });

    it('handles missing optional fields', () => {
      const result = normalizeGithubCiEvent('workflow_run', {
        workflow_run: {
          status: null,
          conclusion: null,
        },
      });

      expect(result).not.toBeNull();
      expect(result!.action).toBeNull();
      expect(result!.repository).toBeNull();
      expect(result!.branch).toBeNull();
      expect(result!.prNumber).toBeNull();
      expect(result!.runUrl).toBeNull();
    });
  });
});

// ── buildCiStatusComment ────────────────────────────────────────────────────

describe('buildCiStatusComment', () => {
  it('builds a markdown comment with all sections', () => {
    const event = {
      source: 'github' as const,
      eventName: 'check_run' as const,
      action: 'completed',
      repository: 'acme/vibe-flow',
      branch: 'task/TASK-1-fix',
      prNumber: 42,
      runUrl: 'https://ci.example/run/1',
      overallStatus: 'completed',
      overallConclusion: 'success',
      checks: [
        { name: 'CI / test', status: 'completed', conclusion: 'success', detailsUrl: 'https://ci.example/test' },
        { name: 'CI / lint', status: 'completed', conclusion: 'failure', detailsUrl: null },
      ],
    };

    const comment = buildCiStatusComment('TASK-1', event);
    expect(comment).toContain('## CI Status Update');
    expect(comment).toContain('`TASK-1`');
    expect(comment).toContain('`task/TASK-1-fix`');
    expect(comment).toContain('`check_run`');
    expect(comment).toContain('**success**');
    expect(comment).toContain('https://ci.example/run/1');
    expect(comment).toContain('### Quality Signals');
    expect(comment).toContain('### Checks');
    expect(comment).toContain('`CI / test`');
    expect(comment).toContain('`CI / lint`');
  });

  it('shows "No checks present" when checks array is empty', () => {
    const event = {
      source: 'github' as const,
      eventName: 'check_run' as const,
      action: 'completed',
      repository: null,
      branch: null,
      prNumber: null,
      runUrl: null,
      overallStatus: null,
      overallConclusion: null,
      checks: [] as const,
    };

    const comment = buildCiStatusComment('TASK-1', event);
    expect(comment).toContain('No checks present in webhook payload');
  });

  it('omits run URL line when runUrl is null', () => {
    const event = {
      source: 'github' as const,
      eventName: 'check_run' as const,
      action: 'completed',
      repository: null,
      branch: null,
      prNumber: null,
      runUrl: null,
      overallStatus: null,
      overallConclusion: null,
      checks: [
        { name: 'CI / test', status: 'completed', conclusion: 'success', detailsUrl: null },
      ],
    };

    const comment = buildCiStatusComment('TASK-1', event);
    expect(comment).not.toContain('Run:');
  });

  it('shows unknown for null branch and conclusion', () => {
    const event = {
      source: 'github' as const,
      eventName: 'workflow_run' as const,
      action: 'completed',
      repository: null,
      branch: null,
      prNumber: null,
      runUrl: null,
      overallStatus: null,
      overallConclusion: null,
      checks: [] as const,
    };

    const comment = buildCiStatusComment('TASK-1', event);
    expect(comment).toContain('`unknown`');
    expect(comment).toContain('**unknown**');
  });

  it('includes details URL link when check has one', () => {
    const event = {
      source: 'github' as const,
      eventName: 'check_run' as const,
      action: 'completed',
      repository: null,
      branch: null,
      prNumber: null,
      runUrl: null,
      overallStatus: null,
      overallConclusion: null,
      checks: [
        { name: 'CI / build', status: 'completed', conclusion: 'success', detailsUrl: 'https://example.com/details' },
      ],
    };

    const comment = buildCiStatusComment('TASK-1', event);
    expect(comment).toContain('[details](https://example.com/details)');
  });

  it('omits details link when check has no detailsUrl', () => {
    const event = {
      source: 'github' as const,
      eventName: 'check_run' as const,
      action: 'completed',
      repository: null,
      branch: null,
      prNumber: null,
      runUrl: null,
      overallStatus: null,
      overallConclusion: null,
      checks: [
        { name: 'CI / build', status: null, conclusion: 'success', detailsUrl: null },
      ],
    };

    const comment = buildCiStatusComment('TASK-1', event);
    expect(comment).toContain('`CI / build`: **success**');
    expect(comment).not.toContain('[details]');
  });

  it('uses conclusion over status for check line display', () => {
    const event = {
      source: 'github' as const,
      eventName: 'check_run' as const,
      action: 'completed',
      repository: null,
      branch: null,
      prNumber: null,
      runUrl: null,
      overallStatus: null,
      overallConclusion: null,
      checks: [
        { name: 'test', status: 'completed', conclusion: 'failure', detailsUrl: null },
      ],
    };

    const comment = buildCiStatusComment('TASK-1', event);
    expect(comment).toContain('**failure**');
  });

  it('falls back to status when conclusion is null', () => {
    const event = {
      source: 'github' as const,
      eventName: 'check_run' as const,
      action: 'completed',
      repository: null,
      branch: null,
      prNumber: null,
      runUrl: null,
      overallStatus: null,
      overallConclusion: null,
      checks: [
        { name: 'test', status: 'in_progress', conclusion: null, detailsUrl: null },
      ],
    };

    const comment = buildCiStatusComment('TASK-1', event);
    expect(comment).toContain('**in_progress**');
  });

  it('shows "unknown" when both status and conclusion are null', () => {
    const event = {
      source: 'github' as const,
      eventName: 'check_run' as const,
      action: 'completed',
      repository: null,
      branch: null,
      prNumber: null,
      runUrl: null,
      overallStatus: null,
      overallConclusion: null,
      checks: [
        { name: 'test', status: null, conclusion: null, detailsUrl: null },
      ],
    };

    const comment = buildCiStatusComment('TASK-1', event);
    expect(comment).toContain('`test`: **unknown**');
  });

  describe('quality signal summarization', () => {
    it('shows "passed" for tests when all test checks succeed', () => {
      const event = {
        source: 'github' as const,
        eventName: 'check_run' as const,
        action: 'completed',
        repository: null,
        branch: null,
        prNumber: null,
        runUrl: null,
        overallStatus: null,
        overallConclusion: null,
        checks: [
          { name: 'unit-test', status: 'completed', conclusion: 'success', detailsUrl: null },
          { name: 'vitest', status: 'completed', conclusion: 'success', detailsUrl: null },
        ],
      };
      const comment = buildCiStatusComment('TASK-1', event);
      expect(comment).toContain('Tests: **passed**');
    });

    it('shows "failed" for tests when any test check has failure', () => {
      const event = {
        source: 'github' as const,
        eventName: 'check_run' as const,
        action: 'completed',
        repository: null,
        branch: null,
        prNumber: null,
        runUrl: null,
        overallStatus: null,
        overallConclusion: null,
        checks: [
          { name: 'unit-test', status: 'completed', conclusion: 'success', detailsUrl: null },
          { name: 'integration-test', status: 'completed', conclusion: 'failure', detailsUrl: null },
        ],
      };
      const comment = buildCiStatusComment('TASK-1', event);
      expect(comment).toContain('Tests: **failed**');
    });

    it('shows "cancelled" for category when check is cancelled', () => {
      const event = {
        source: 'github' as const,
        eventName: 'check_run' as const,
        action: 'completed',
        repository: null,
        branch: null,
        prNumber: null,
        runUrl: null,
        overallStatus: null,
        overallConclusion: null,
        checks: [
          { name: 'eslint', status: 'completed', conclusion: 'cancelled', detailsUrl: null },
        ],
      };
      const comment = buildCiStatusComment('TASK-1', event);
      expect(comment).toContain('Lint: **cancelled**');
    });

    it('shows "mixed" when checks have mixed conclusions', () => {
      const event = {
        source: 'github' as const,
        eventName: 'check_run' as const,
        action: 'completed',
        repository: null,
        branch: null,
        prNumber: null,
        runUrl: null,
        overallStatus: null,
        overallConclusion: null,
        checks: [
          { name: 'eslint-check', status: 'completed', conclusion: 'success', detailsUrl: null },
          { name: 'ruff-lint', status: 'completed', conclusion: 'neutral', detailsUrl: null },
        ],
      };
      const comment = buildCiStatusComment('TASK-1', event);
      expect(comment).toContain('Lint: **mixed**');
    });

    it('shows "n/a" when no checks match a quality signal category', () => {
      const event = {
        source: 'github' as const,
        eventName: 'check_run' as const,
        action: 'completed',
        repository: null,
        branch: null,
        prNumber: null,
        runUrl: null,
        overallStatus: null,
        overallConclusion: null,
        checks: [
          { name: 'deploy', status: 'completed', conclusion: 'success', detailsUrl: null },
        ],
      };
      const comment = buildCiStatusComment('TASK-1', event);
      expect(comment).toContain('Tests: **n/a**');
      expect(comment).toContain('Lint: **n/a**');
      expect(comment).toContain('Coverage: **n/a**');
    });

    it('shows "failed" for timed_out conclusion', () => {
      const event = {
        source: 'github' as const,
        eventName: 'check_run' as const,
        action: 'completed',
        repository: null,
        branch: null,
        prNumber: null,
        runUrl: null,
        overallStatus: null,
        overallConclusion: null,
        checks: [
          { name: 'jest-test', status: 'completed', conclusion: 'timed_out', detailsUrl: null },
        ],
      };
      const comment = buildCiStatusComment('TASK-1', event);
      expect(comment).toContain('Tests: **failed**');
    });
  });
});

// ── buildTaskIdCandidatesFromBranch ─────────────────────────────────────────

describe('buildTaskIdCandidatesFromBranch', () => {
  it('returns empty for non-task branches', () => {
    expect(buildTaskIdCandidatesFromBranch('main')).toEqual([]);
    expect(buildTaskIdCandidatesFromBranch('feat/something')).toEqual([]);
    expect(buildTaskIdCandidatesFromBranch('fix/bug')).toEqual([]);
  });

  it('returns empty for bare "task/" prefix', () => {
    expect(buildTaskIdCandidatesFromBranch('task/')).toEqual([]);
  });

  it('returns candidates longest-first for hyphenated task ids', () => {
    expect(buildTaskIdCandidatesFromBranch('task/TASK-100-fix-ci')).toEqual([
      'TASK-100-fix-ci',
      'TASK-100-fix',
      'TASK-100',
      'TASK',
    ]);
  });

  it('returns single candidate for single-segment branch', () => {
    expect(buildTaskIdCandidatesFromBranch('task/TASK100')).toEqual(['TASK100']);
  });

  it('handles whitespace-padded branch names', () => {
    expect(buildTaskIdCandidatesFromBranch('  task/TASK-1  ')).toEqual([
      'TASK-1',
      'TASK',
    ]);
  });

  it('filters empty segments from consecutive hyphens', () => {
    const result = buildTaskIdCandidatesFromBranch('task/TASK--100');
    // Segments filter out empty strings, so only "TASK" and "100" remain
    expect(result).toEqual(['TASK-100', 'TASK']);
  });

  it('returns empty when suffix is only hyphens (all segments empty)', () => {
    expect(buildTaskIdCandidatesFromBranch('task/---')).toEqual([]);
    expect(buildTaskIdCandidatesFromBranch('task/-')).toEqual([]);
  });
});

// ── readRequestBody ─────────────────────────────────────────────────────────

describe('readRequestBody', () => {
  it('reads a normal request body', async () => {
    const body = JSON.stringify({ hello: 'world' });
    const result = await readRequestBody(createRequest(body));
    expect(result.toString('utf8')).toBe(body);
  });

  it('returns empty buffer for empty request', async () => {
    const result = await readRequestBody(createEmptyRequest());
    expect(result.length).toBe(0);
  });

  it('throws RequestBodyTooLargeError when body exceeds max', async () => {
    const largeBody = 'x'.repeat(100);
    await expect(readRequestBody(createRequest(largeBody), 50))
      .rejects.toThrow(RequestBodyTooLargeError);
  });

  it('accepts body exactly at max size', async () => {
    const body = 'x'.repeat(50);
    const result = await readRequestBody(createRequest(body), 50);
    expect(result.length).toBe(50);
  });

  it('handles string chunks (non-Buffer) by converting them', async () => {
    const readable = new Readable({
      objectMode: true,
      read() {
        // Push a raw string in object mode so Buffer.isBuffer returns false
        this.push('hello-string-chunk');
        this.push(null);
      },
    });
    const req = readable as unknown as import('node:http').IncomingMessage;
    const result = await readRequestBody(req);
    expect(result.toString('utf8')).toBe('hello-string-chunk');
  });
});

// ── parseJsonRequestBody ────────────────────────────────────────────────────

describe('parseJsonRequestBody', () => {
  it('parses valid JSON object', () => {
    const result = parseJsonRequestBody(Buffer.from('{"key":"value"}'));
    expect(result).toEqual({ key: 'value' });
  });

  it('returns empty object for empty body', () => {
    const result = parseJsonRequestBody(Buffer.from(''));
    expect(result).toEqual({});
  });

  it('returns empty object for whitespace-only body', () => {
    const result = parseJsonRequestBody(Buffer.from('   '));
    expect(result).toEqual({});
  });

  it('throws InvalidJsonPayloadError for malformed JSON', () => {
    expect(() => parseJsonRequestBody(Buffer.from('{not json')))
      .toThrow(InvalidJsonPayloadError);
    expect(() => parseJsonRequestBody(Buffer.from('{not json')))
      .toThrow('Malformed JSON payload');
  });

  it('throws InvalidJsonPayloadError for JSON array (not object)', () => {
    expect(() => parseJsonRequestBody(Buffer.from('[1,2,3]')))
      .toThrow(InvalidJsonPayloadError);
    expect(() => parseJsonRequestBody(Buffer.from('[1,2,3]')))
      .toThrow('Expected JSON object payload');
  });

  it('throws InvalidJsonPayloadError for JSON string primitive', () => {
    expect(() => parseJsonRequestBody(Buffer.from('"hello"')))
      .toThrow(InvalidJsonPayloadError);
  });

  it('throws InvalidJsonPayloadError for JSON number primitive', () => {
    expect(() => parseJsonRequestBody(Buffer.from('42')))
      .toThrow(InvalidJsonPayloadError);
  });

  it('throws InvalidJsonPayloadError for JSON null', () => {
    expect(() => parseJsonRequestBody(Buffer.from('null')))
      .toThrow(InvalidJsonPayloadError);
  });
});

// ── readJsonRequestBody ─────────────────────────────────────────────────────

describe('readJsonRequestBody', () => {
  it('reads and parses a valid JSON request', async () => {
    const result = await readJsonRequestBody(createRequest('{"test":true}'));
    expect(result).toEqual({ test: true });
  });

  it('throws for oversized body', async () => {
    const largeBody = JSON.stringify({ data: 'x'.repeat(200) });
    await expect(readJsonRequestBody(createRequest(largeBody), 50))
      .rejects.toThrow(RequestBodyTooLargeError);
  });

  it('throws for malformed JSON', async () => {
    await expect(readJsonRequestBody(createRequest('{invalid')))
      .rejects.toThrow(InvalidJsonPayloadError);
  });
});
