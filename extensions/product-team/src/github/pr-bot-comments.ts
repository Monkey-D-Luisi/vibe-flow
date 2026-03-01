import type { TaskRecord } from '../domain/task-record.js';
import { asRecord, asString, asStringArray } from './pr-bot-labels.js';

export function extractAcceptanceCriteria(task: TaskRecord): string[] {
  const metadata = asRecord(task.metadata) ?? {};
  const direct = asStringArray(metadata.acceptanceCriteria);
  if (direct.length > 0) {
    return direct;
  }

  const snakeCase = asStringArray(metadata.acceptance_criteria);
  if (snakeCase.length > 0) {
    return snakeCase;
  }

  const poBrief = asRecord(metadata.po_brief);
  if (!poBrief) {
    return [];
  }
  return asStringArray(poBrief.acceptance_criteria);
}

export function sanitizeTaskPath(taskPath: string): string | null {
  const normalized = taskPath
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\/+/, '');

  if (normalized.length === 0) {
    return null;
  }

  const segments: string[] = [];
  for (const segment of normalized.split('/')) {
    const trimmed = segment.trim();
    if (trimmed.length === 0 || trimmed === '.') {
      continue;
    }
    if (trimmed === '..') {
      return null;
    }
    segments.push(trimmed);
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

export function resolveTaskLink(
  task: TaskRecord,
  owner: string,
  repo: string,
  defaultBase: string,
): string {
  const metadata = asRecord(task.metadata) ?? {};
  const directUrl = asString(metadata.taskUrl);
  if (directUrl) {
    return directUrl;
  }

  const taskPath = asString(metadata.taskPath);
  if (taskPath) {
    const normalized = sanitizeTaskPath(taskPath);
    if (normalized) {
      return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(defaultBase)}/${normalized}`;
    }
  }

  return `https://github.com/${owner}/${repo}/search?q=${encodeURIComponent(task.id)}`;
}

export function buildStatusComment(task: TaskRecord, taskLink: string): string {
  const criteria = extractAcceptanceCriteria(task);
  const checklistLines = criteria.length > 0
    ? criteria.map((criterion) => `- [ ] ${criterion}`)
    : [
      '- [ ] Confirm acceptance criteria',
      '- [ ] Run `pnpm test`',
      '- [ ] Run `pnpm lint`',
      '- [ ] Run `pnpm typecheck`',
      '- [ ] Update walkthrough/evidence',
    ];

  return [
    '## PR-Bot Status',
    '',
    `Task: [${task.id}](${taskLink})`,
    `Title: ${task.title}`,
    `Scope: ${task.scope}`,
    `Status: ${task.status}`,
    '',
    '### Checklist',
    ...checklistLines,
  ].join('\n');
}
