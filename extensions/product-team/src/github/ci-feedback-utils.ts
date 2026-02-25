import type { IncomingMessage } from 'node:http';

const DEFAULT_MAX_BODY_BYTES = 1_000_000;

export class RequestBodyTooLargeError extends Error {
  constructor(maxBodyBytes: number) {
    super(`Request body exceeds max size (${maxBodyBytes} bytes)`);
    this.name = 'RequestBodyTooLargeError';
  }
}

export class InvalidJsonPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJsonPayloadError';
  }
}

interface CiCheckSummary {
  readonly name: string;
  readonly status: string | null;
  readonly conclusion: string | null;
  readonly detailsUrl: string | null;
}

export interface NormalizedGithubCiEvent {
  readonly source: 'github';
  readonly eventName: 'check_run' | 'workflow_run';
  readonly action: string | null;
  readonly repository: string | null;
  readonly branch: string | null;
  readonly prNumber: number | null;
  readonly runUrl: string | null;
  readonly overallStatus: string | null;
  readonly overallConclusion: string | null;
  readonly checks: readonly CiCheckSummary[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

function resolvePrNumber(value: unknown): number | null {
  const direct = asNumber(value);
  if (direct !== null && direct > 0) {
    return direct;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function normalizeCheckStatus(status: string | null, conclusion: string | null): string {
  return conclusion ?? status ?? 'unknown';
}

function summarizeCategory(
  checks: readonly CiCheckSummary[],
  keywords: readonly string[],
): string {
  const relevant = checks.filter((check) => {
    const lowered = check.name.toLowerCase();
    return keywords.some((keyword) => lowered.includes(keyword));
  });
  if (relevant.length === 0) {
    return 'n/a';
  }

  if (relevant.some((check) => check.conclusion === 'failure' || check.conclusion === 'timed_out')) {
    return 'failed';
  }
  if (relevant.some((check) => check.conclusion === 'cancelled')) {
    return 'cancelled';
  }
  if (relevant.every((check) => check.conclusion === 'success')) {
    return 'passed';
  }
  return 'mixed';
}

function buildCheckLine(check: CiCheckSummary): string {
  const status = normalizeCheckStatus(check.status, check.conclusion);
  if (check.detailsUrl) {
    return `- \`${check.name}\`: **${status}** ([details](${check.detailsUrl}))`;
  }
  return `- \`${check.name}\`: **${status}**`;
}

export function buildCiStatusComment(
  taskId: string,
  event: NormalizedGithubCiEvent,
): string {
  const checks = [...event.checks].sort((a, b) => a.name.localeCompare(b.name));
  const qualitySignals = {
    tests: summarizeCategory(checks, ['test', 'vitest', 'jest', 'unit', 'integration']),
    lint: summarizeCategory(checks, ['lint', 'eslint', 'ruff']),
    coverage: summarizeCategory(checks, ['coverage', 'istanbul']),
  };

  const lines: string[] = [
    '## CI Status Update',
    '',
    `Task: \`${taskId}\``,
    `Branch: \`${event.branch ?? 'unknown'}\``,
    `Event: \`${event.eventName}\``,
    `Conclusion: **${event.overallConclusion ?? 'unknown'}**`,
  ];

  if (event.runUrl) {
    lines.push(`Run: ${event.runUrl}`);
  }

  lines.push(
    '',
    '### Quality Signals',
    `- Tests: **${qualitySignals.tests}**`,
    `- Lint: **${qualitySignals.lint}**`,
    `- Coverage: **${qualitySignals.coverage}**`,
    '',
    '### Checks',
  );

  if (checks.length === 0) {
    lines.push('- No checks present in webhook payload');
  } else {
    for (const check of checks) {
      lines.push(buildCheckLine(check));
    }
  }

  return lines.join('\n');
}

function parsePrNumberFromPullRequests(value: unknown): number | null {
  const entries = asRecordArray(value);
  for (const entry of entries) {
    const number = resolvePrNumber(entry.number);
    if (number !== null) {
      return number;
    }
  }
  return null;
}

function normalizeCheckRunEvent(payload: Record<string, unknown>): NormalizedGithubCiEvent | null {
  const checkRun = asRecord(payload.check_run);
  if (!checkRun) {
    return null;
  }

  const checkSuite = asRecord(checkRun.check_suite);
  const repository = asRecord(payload.repository);
  const branch = asString(checkSuite?.head_branch) ?? asString(checkRun.head_branch);
  const prNumber = parsePrNumberFromPullRequests(checkRun.pull_requests);

  const check: CiCheckSummary = {
    name: asString(checkRun.name) ?? 'check_run',
    status: asString(checkRun.status),
    conclusion: asString(checkRun.conclusion),
    detailsUrl: asString(checkRun.html_url),
  };

  return {
    source: 'github',
    eventName: 'check_run',
    action: asString(payload.action),
    repository: asString(repository?.full_name),
    branch,
    prNumber,
    runUrl: asString(checkRun.html_url),
    overallStatus: asString(checkRun.status),
    overallConclusion: asString(checkRun.conclusion),
    checks: [check],
  };
}

function normalizeWorkflowRunEvent(payload: Record<string, unknown>): NormalizedGithubCiEvent | null {
  const workflowRun = asRecord(payload.workflow_run);
  if (!workflowRun) {
    return null;
  }

  const repository = asRecord(payload.repository);
  const check: CiCheckSummary = {
    name: asString(workflowRun.name) ?? 'workflow_run',
    status: asString(workflowRun.status),
    conclusion: asString(workflowRun.conclusion),
    detailsUrl: asString(workflowRun.html_url),
  };

  return {
    source: 'github',
    eventName: 'workflow_run',
    action: asString(payload.action),
    repository: asString(repository?.full_name),
    branch: asString(workflowRun.head_branch),
    prNumber: parsePrNumberFromPullRequests(workflowRun.pull_requests),
    runUrl: asString(workflowRun.html_url),
    overallStatus: asString(workflowRun.status),
    overallConclusion: asString(workflowRun.conclusion),
    checks: [check],
  };
}

export function normalizeGithubCiEvent(
  eventName: string,
  payload: Record<string, unknown>,
): NormalizedGithubCiEvent | null {
  if (eventName === 'check_run') {
    return normalizeCheckRunEvent(payload);
  }
  if (eventName === 'workflow_run') {
    return normalizeWorkflowRunEvent(payload);
  }
  return null;
}

export async function readRequestBody(
  req: IncomingMessage,
  maxBodyBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBodyBytes) {
      throw new RequestBodyTooLargeError(maxBodyBytes);
    }
    chunks.push(buffer);
  }

  return chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks);
}

export function parseJsonRequestBody(body: Buffer): Record<string, unknown> {
  const raw = body.toString('utf8').trim();
  if (raw.length === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidJsonPayloadError('Malformed JSON payload');
  }

  const record = asRecord(parsed);
  if (!record) {
    throw new InvalidJsonPayloadError('Expected JSON object payload');
  }
  return record;
}

export async function readJsonRequestBody(
  req: IncomingMessage,
  maxBodyBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const body = await readRequestBody(req, maxBodyBytes);
  return parseJsonRequestBody(body);
}

export function buildTaskIdCandidatesFromBranch(branch: string): string[] {
  const normalized = branch.trim();
  if (!normalized.startsWith('task/')) {
    return [];
  }
  const suffix = normalized.slice('task/'.length);
  if (suffix.length === 0) {
    return [];
  }

  const segments = suffix.split('-').filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return [];
  }

  const candidates: string[] = [];
  for (let end = segments.length; end >= 1; end -= 1) {
    candidates.push(segments.slice(0, end).join('-'));
  }
  return candidates;
}
