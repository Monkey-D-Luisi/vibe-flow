import { promises as fs } from 'node:fs';

function asError(error: unknown): NodeJS.ErrnoException {
  return error as NodeJS.ErrnoException;
}

export async function readFileSafe(path: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch (error) {
    const err = asError(error);
    if (err && err.code === 'ENOENT') {
      throw new Error(`NOT_FOUND: File not found at ${path}`);
    }
    throw error;
  }
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFileSafe(path);
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`PARSE_ERROR: Invalid JSON at ${path}`);
  }
}
