import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { lintRepository } from '../pattern-lint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

async function withFixture<T>(name: string, fn: (workspace: string) => Promise<T>): Promise<T> {
  const source = path.join(FIXTURES_DIR, name);
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pattern-lint-'));
  const originalCwd = process.cwd();

  await fs.cp(source, workspace, { recursive: true });
  process.chdir(workspace);

  try {
    return await fn(workspace);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

test('passes on valid pattern catalog', async () => {
  await withFixture('valid', async () => {
    const summary = await lintRepository();
    assert.equal(summary.issues.length, 0);
    assert.equal(summary.checked, 1);
  });
});

test('flags missing headings', async () => {
  await withFixture('missing-heading', async () => {
    const summary = await lintRepository();
    assert(
      summary.issues.some((issue) => issue.message.includes('Missing heading "## References"')),
      'Expected missing heading error',
    );
  });
});

test('rejects unsupported statuses', async () => {
  await withFixture('invalid-status', async () => {
    const summary = await lintRepository();
    assert(
      summary.issues.some((issue) => issue.message.includes('Invalid status "pending"')),
      'Expected invalid status error',
    );
  });
});

test('deprecated patterns require replacement references', async () => {
  await withFixture('deprecated-missing-related', async () => {
    const summary = await lintRepository();
    assert(
      summary.issues.some((issue) => issue.message.includes('Deprecated patterns must list an alternative')),
      'Expected error about missing replacement',
    );
  });
});
