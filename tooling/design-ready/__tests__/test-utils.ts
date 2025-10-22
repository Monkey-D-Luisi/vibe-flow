import { promises as fs, Dirent } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

export async function withFixture<T>(name: string, fn: (workspace: string) => Promise<T>): Promise<T> {
  const source = path.join(FIXTURES_DIR, name);
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'design-ready-'));
  const originalCwd = process.cwd();

  await copyTree(source, workspace);
  process.chdir(workspace);

  try {
    return await fn(workspace);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

export async function copyTree(source: string, target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const src = path.join(source, entry.name);
      const dest = path.join(target, entry.name);
      if (entry.isDirectory()) {
        await copyTree(src, dest);
      } else if (entry.isFile()) {
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(src, dest);
      }
    }),
  );
}

export async function listFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  await walk(dir, async (entry, parent) => {
    const resolved = path.join(parent, entry.name);
    if (entry.isFile()) {
      results.push(resolved);
    }
  });
  return results;
}

async function walk(dir: string, onEntry: (entry: Dirent, parent: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    await onEntry(entry, dir);
    if (entry.isDirectory()) {
      await walk(target, onEntry);
    }
  }
}
