import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import test from 'node:test';

import { lintRepository } from '../adr-lint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

async function withFixture<T>(name: string, fn: (root: string) => Promise<T>): Promise<T> {
  const source = path.join(FIXTURES_DIR, name);
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'adr-lint-'));
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

test('passes on valid ADRs', { concurrency: false }, async () => {
  await withFixture('valid', async () => {
    const summary = await lintRepository();
    assert.equal(summary.issues.length, 0, 'Expected no issues for the valid fixture');
    assert.equal(summary.checked, 1);
  });
});

test('reports missing required heading', { concurrency: false }, async () => {
  await withFixture('missing-heading', async () => {
    const summary = await lintRepository();
    assert(
      summary.issues.some((issue) => issue.message.includes('Missing required heading "Decision"')),
      'Should flag missing Decision heading',
    );
  });
});

test('rejects invalid status values', { concurrency: false }, async () => {
  await withFixture('invalid-status', async () => {
    const summary = await lintRepository();
    assert(
      summary.issues.some((issue) => issue.message.includes('Status "pending" is invalid')),
      'Should report invalid status',
    );
  });
});

test('detects invalid superseded references', { concurrency: false }, async () => {
  await withFixture('missing-reference', async () => {
    const summary = await lintRepository();
    assert(
      summary.issues.some((issue) =>
        issue.message.includes('superseded_by points to a non-existent ADR'),
      ),
      'Should report missing superseded targets',
    );
  });
});
