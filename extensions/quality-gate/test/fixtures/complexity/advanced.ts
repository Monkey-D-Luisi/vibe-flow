/**
 * Advanced TypeScript fixture for complexity analysis tests.
 *
 * This file contains functions with higher cyclomatic complexity,
 * including loops, nested conditionals, switch statements, and
 * logical operators.
 */

export interface Item {
  id: string;
  type: 'A' | 'B' | 'C' | 'D';
  value: number;
  active: boolean;
  tags?: string[];
}

export function processItems(items: Item[]): { total: number; count: number; errors: string[] } {
  const errors: string[] = [];
  let total = 0;
  let count = 0;

  for (const item of items) {
    if (!item.active) {
      continue;
    }

    if (item.value < 0 || item.value > 1000) {
      errors.push(`Invalid value for ${item.id}: ${item.value}`);
      continue;
    }

    switch (item.type) {
      case 'A':
        total += item.value * 1.0;
        break;
      case 'B':
        total += item.value * 1.5;
        break;
      case 'C':
        total += item.value * 2.0;
        break;
      case 'D':
        if (item.tags && item.tags.length > 0) {
          total += item.value * 3.0;
        } else {
          total += item.value * 2.5;
        }
        break;
      default:
        errors.push(`Unknown type for ${item.id}`);
    }

    count++;
  }

  return { total, count, errors };
}

export function findBestMatch(
  candidates: Item[],
  targetValue: number,
  requiredTags?: string[],
): Item | null {
  let bestMatch: Item | null = null;
  let bestDiff = Infinity;

  for (const candidate of candidates) {
    if (!candidate.active) {
      continue;
    }

    if (requiredTags && requiredTags.length > 0) {
      const hasTags = candidate.tags ?? [];
      const hasAll = requiredTags.every((tag) => hasTags.includes(tag));
      if (!hasAll) {
        continue;
      }
    }

    const diff = Math.abs(candidate.value - targetValue);
    if (diff < bestDiff || (diff === bestDiff && candidate.value > (bestMatch?.value ?? 0))) {
      bestMatch = candidate;
      bestDiff = diff;
    }
  }

  return bestMatch;
}

export class ItemProcessor {
  private items: Item[] = [];
  private processed = false;

  addItem(item: Item): void {
    if (this.processed) {
      throw new Error('Cannot add items after processing');
    }
    this.items.push(item);
  }

  process(): Map<string, number> {
    const result = new Map<string, number>();

    for (const item of this.items) {
      if (!item.active) {
        continue;
      }

      const existing = result.get(item.type) ?? 0;

      if (item.value > 100 && item.type === 'A') {
        result.set(item.type, existing + item.value * 2);
      } else if (item.value > 50 || item.type === 'B') {
        result.set(item.type, existing + item.value * 1.5);
      } else {
        result.set(item.type, existing + item.value);
      }
    }

    this.processed = true;
    return result;
  }

  getStats(): { min: number; max: number; avg: number } | null {
    if (this.items.length === 0) {
      return null;
    }

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (const item of this.items) {
      if (item.value < min) {
        min = item.value;
      }
      if (item.value > max) {
        max = item.value;
      }
      sum += item.value;
    }

    return {
      min,
      max,
      avg: sum / this.items.length,
    };
  }
}
