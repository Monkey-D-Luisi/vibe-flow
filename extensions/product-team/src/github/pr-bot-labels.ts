import type { TaskRecord } from '../domain/task-record.js';
import type { LabelInput } from './pr-bot-types.js';

export const SCOPE_COLORS: Record<'major' | 'minor' | 'patch', string> = {
  major: 'd93f0b',
  minor: 'fbca04',
  patch: '0e8a16',
};

export const EPIC_COLOR = '7057ff';
export const AREA_COLOR = '006b75';

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function toLabelSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

export function toPrefixedLabel(prefix: 'epic' | 'area', value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith(`${prefix}:`)) {
    const suffix = trimmed.slice(prefix.length + 1).trim();
    return `${prefix}:${toLabelSlug(suffix)}`;
  }
  return `${prefix}:${toLabelSlug(trimmed)}`;
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function extractMetadataLabels(task: TaskRecord): string[] {
  const labels: string[] = [`scope:${task.scope}`];
  const metadata = asRecord(task.metadata) ?? {};

  const tagLabels = asStringArray(task.tags);
  for (const tag of tagLabels) {
    const lowered = tag.toLowerCase();
    if (lowered.startsWith('epic:')) {
      labels.push(toPrefixedLabel('epic', tag));
    }
    if (lowered.startsWith('area:')) {
      labels.push(toPrefixedLabel('area', tag));
    }
  }

  const metadataEpic = asString(metadata.epic) ?? asString(metadata.epicId);
  if (metadataEpic) {
    labels.push(toPrefixedLabel('epic', metadataEpic));
  }

  const metadataArea = metadata.area;
  if (typeof metadataArea === 'string') {
    labels.push(toPrefixedLabel('area', metadataArea));
  } else if (Array.isArray(metadataArea)) {
    for (const item of metadataArea) {
      if (typeof item === 'string' && item.trim().length > 0) {
        labels.push(toPrefixedLabel('area', item));
      }
    }
  }

  return uniqueSorted(labels);
}

export function toLabelInput(label: string): LabelInput {
  if (label.startsWith('scope:')) {
    const scope = label.slice('scope:'.length);
    if (scope === 'major' || scope === 'minor' || scope === 'patch') {
      return {
        name: label,
        color: SCOPE_COLORS[scope],
        description: `Task scope ${scope}`,
      };
    }
  }

  if (label.startsWith('epic:')) {
    return {
      name: label,
      color: EPIC_COLOR,
      description: 'Task epic',
    };
  }

  return {
    name: label,
    color: AREA_COLOR,
    description: 'Task area',
  };
}
