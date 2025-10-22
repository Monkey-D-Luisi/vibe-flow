import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { withFixture } from './test-utils.js';

test('runGeneration produces stable JSON artifact snapshot', async () => {
  await withFixture('gen-snapshot', async (workspace) => {
    process.env.DESIGN_READY_SKIP_TYPES = '1';
    try {
      const { runGeneration } = await import('../gen.js');

      const success = await runGeneration();
      assert.equal(success, true, 'generator should complete successfully');

      const outputPath = path.join(
        workspace,
        'docs',
        'epics',
        'EP00-snapshot',
        'T01-sample',
        '20-design_ready.json',
      );
      const expectedPath = path.join(workspace, 'expected.json');

      const [actual, expected] = await Promise.all([
        fs.readFile(outputPath, 'utf8'),
        fs.readFile(expectedPath, 'utf8'),
      ]);

      const normalize = (input: string): string => input.replace(/\r\n/g, '\n');
      assert.equal(
        normalize(actual),
        normalize(expected),
        'generated artifact must match snapshot',
      );
    } finally {
      delete process.env.DESIGN_READY_SKIP_TYPES;
    }
  });
});
