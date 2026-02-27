import fg from 'fast-glob';
import { resolve } from 'node:path';

export const MAX_PATTERN_LENGTH = 500;

export interface GlobOptions {
  cwd: string;
  exclude?: string[];
}

export async function resolveGlobPatterns(patterns: string[], options: GlobOptions): Promise<string[]> {
  const { cwd, exclude = [] } = options;
  if (!patterns || patterns.length === 0) {
    return [];
  }

  for (const pattern of exclude) {
    if (pattern.length > MAX_PATTERN_LENGTH) {
      throw new Error(`PATTERN_TOO_LONG: Exclude pattern exceeds ${MAX_PATTERN_LENGTH} characters`);
    }
  }

  const files = await fg(patterns, {
    cwd,
    ignore: exclude,
    onlyFiles: true,
    dot: false,
    absolute: true,
    unique: true,
    followSymbolicLinks: false,
  });

  const unique = new Set<string>();
  for (const file of files) {
    unique.add(resolve(file));
  }
  return Array.from(unique).sort();
}
