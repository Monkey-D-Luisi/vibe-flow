import fg from 'fast-glob';
import picomatch from 'picomatch';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

export interface GlobOptions {
  readonly cwd: string;
  readonly exclude?: string[];
}

function asError(error: unknown): NodeJS.ErrnoException {
  return error as NodeJS.ErrnoException;
}

export async function readFileSafe(path: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch (error) {
    const err = asError(error);
    if (err.code === 'ENOENT') {
      throw new Error(`NOT_FOUND: File not found at ${path}`);
    }
    throw error;
  }
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFileSafe(path);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`PARSE_ERROR: Invalid JSON at ${path}`);
  }
}

export async function resolveGlobPatterns(
  patterns: string[],
  options: GlobOptions,
): Promise<string[]> {
  const { cwd, exclude = [] } = options;
  if (patterns.length === 0) {
    return [];
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

export function filterByExclude(path: string, excludePatterns: string[]): boolean {
  if (excludePatterns.length === 0) {
    return true;
  }

  return !excludePatterns.some((pattern) => picomatch(pattern)(path));
}
