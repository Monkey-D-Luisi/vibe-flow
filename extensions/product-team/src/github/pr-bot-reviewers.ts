import type { TaskRecord } from '../domain/task-record.js';
import type { PrBotConfig } from './pr-bot-types.js';
import { uniqueSorted } from './pr-bot-labels.js';

const REVIEWER_PATTERN = /^[A-Za-z0-9-]+(?:\/[A-Za-z0-9_.-]+)?$/;

function normalizeReviewer(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return REVIEWER_PATTERN.test(trimmed) ? trimmed : null;
}

export function resolveReviewers(task: TaskRecord, config: PrBotConfig): string[] {
  const byScope = config.reviewers[task.scope];
  const values = [
    ...byScope,
    ...config.reviewers.default,
  ];

  const normalized = values
    .map((item) => normalizeReviewer(item))
    .filter((item): item is string => item !== null);

  return uniqueSorted(normalized);
}
