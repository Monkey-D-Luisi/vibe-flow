import assert from 'node:assert/strict';
import test from 'node:test';

import { lintRepository } from '../lint.js';
import { withFixture } from './test-utils.js';

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
