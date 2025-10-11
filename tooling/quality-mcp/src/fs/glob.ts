import fg from 'fast-glob';
import { resolve } from 'node:path';

export interface GlobOptions {
  cwd: string;
  exclude?: string[];
}

/**
 * Resolve an array of glob patterns relative to a working directory.
 */
export async function resolveGlobPatterns(patterns: string[], options: GlobOptions): Promise<string[]> {
  const { cwd, exclude = [] } = options;
  if (!patterns || patterns.length === 0) {
    return [];
  }

  const files = await fg(patterns, {
    cwd,
    ignore: exclude,
    onlyFiles: true,
    dot: false,
    absolute: true,
    unique: true,
    followSymbolicLinks: true
  });

  const unique = new Set<string>();
  for (const file of files) {
    unique.add(resolve(file));
  }
  return Array.from(unique).sort();
}
