import { promises as fs } from 'node:fs';

export const MAX_JSON_FILE_BYTES = 50 * 1024 * 1024;

function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
    return e instanceof Error && 'code' in e;
}

export async function readFileSafe(path: string): Promise<string> {
    try {
        return await fs.readFile(path, 'utf8');
    } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            throw new Error(`NOT_FOUND: File not found at ${path}`);
        }
        throw error;
    }
}

export async function readJsonFile<T>(path: string): Promise<T> {
    let size: number;
    try {
        const stat = await fs.stat(path);
        size = stat.size;
    } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            throw new Error(`NOT_FOUND: File not found at ${path}`);
        }
        throw error;
    }
    if (size > MAX_JSON_FILE_BYTES) {
        throw new Error(`FILE_TOO_LARGE: JSON file at ${path} exceeds ${MAX_JSON_FILE_BYTES} bytes`);
    }
    const raw = await readFileSafe(path);
    try {
        return JSON.parse(raw) as T;
    } catch {
        throw new Error(`PARSE_ERROR: Invalid JSON at ${path}`);
    }
}
