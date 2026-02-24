import type { TaskRecord } from '../domain/task-record.js';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractAcceptanceCriteria(metadata: Record<string, unknown>): string[] {
  const direct = asStringArray(metadata.acceptanceCriteria);
  if (direct.length > 0) {
    return direct;
  }

  const snakeCase = asStringArray(metadata.acceptance_criteria);
  if (snakeCase.length > 0) {
    return snakeCase;
  }

  const poBrief = asRecord(metadata.po_brief);
  if (poBrief) {
    const criteria = asStringArray(poBrief.acceptance_criteria);
    if (criteria.length > 0) {
      return criteria;
    }
  }

  return [];
}

export function buildDefaultPrBody(task: TaskRecord): string {
  const criteria = extractAcceptanceCriteria(task.metadata);
  const criteriaLines = criteria.length > 0
    ? criteria.map((item) => `- ${item}`).join('\n')
    : '- N/A';

  return [
    '## Summary',
    `Implements task ${task.id}: ${task.title}`,
    '',
    '## Related Task',
    `Task ID: ${task.id}`,
    '',
    '## Changes',
    `- Scope: ${task.scope}`,
    `- Current status: ${task.status}`,
    '- Acceptance criteria:',
    criteriaLines,
    '',
    '## Checklist',
    '- [ ] Tests pass (`pnpm test`)',
    '- [ ] Lint clean (`pnpm lint`)',
    '- [ ] Types check (`pnpm typecheck`)',
    '- [ ] Walkthrough updated (for non-trivial changes)',
    '- [ ] No secrets committed',
  ].join('\n');
}
