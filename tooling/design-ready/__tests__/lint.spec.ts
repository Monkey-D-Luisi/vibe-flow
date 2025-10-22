import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { lintRepository } from '../lint.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

async function withFixture<T>(name: string, fn: (workspace: string) => Promise<T>): Promise<T> {
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

async function copyTree(source: string, target: string): Promise<void> {
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

test('lintRepository passes on valid design_ready document', async () => {
  await withFixture('valid', async () => {
    const summary = await lintRepository();
    assert.equal(summary.issues.length, 0, 'expected no lint issues');
    assert.equal(summary.checked, 1);
  });
});

test('lintRepository flags missing pattern references', async () => {
  await withFixture('missing-pattern', async () => {
    const summary = await lintRepository();
    assert(summary.issues.some((issue) => issue.message.includes('not present')), 'expected missing pattern issue');
  });
});

test('lintRepository flags acceptance cases referencing unknown modules', async () => {
  await withFixture('bad-acceptance', async () => {
    const summary = await lintRepository();
    assert(
      summary.issues.some((issue) => issue.message.includes('references unknown module')),
      'expected missing module issue',
    );
  });
});
