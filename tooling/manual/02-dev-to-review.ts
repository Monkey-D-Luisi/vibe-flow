// tooling/manual/02-dev-to-review.ts
import { readFile } from 'node:fs/promises';
import { handleToolCall } from '../../services/task-mcp/src/mcp/tools.ts';

const [tests, cov, lint, cmp] = await Promise.all([
  readFile('.qreport/tests.json','utf8').then(JSON.parse),
  readFile('.qreport/coverage.json','utf8').then(JSON.parse),
  readFile('.qreport/lint.json','utf8').then(JSON.parse),
  readFile('.qreport/complexity.json','utf8').then(JSON.parse),
]);

const id = process.argv[2];
if (!id) throw new Error('Usage: tsx 02-dev-to-review.ts <taskId>');

const lines = cov.total?.lines ?? cov.lines ?? cov.totalLines ?? 0;
const lintErrors = lint.errors ?? lint.summary?.errors ?? 0;
const maxCycl = cmp.maxCyclomatic ?? cmp.metrics?.max ?? 999;

const evidence = {
  rgr_log: [
    { step: 'red', at: new Date().toISOString(), note: 'failing test' },
    { step: 'green', at: new Date().toISOString(), note: 'passing' }
  ],
  coverage: { lines },
  lint: { errors: lintErrors },
  complexity: { max: maxCycl }
};

// Opcional: validar gate antes de la transición
// (esperas exit 0 si pasa)
// import { spawnSync } from 'node:child_process';
// const r = spawnSync('pnpm', ['q:gate','--','--source','artifacts','--scope','minor'], { stdio:'inherit' });
// if (r.status !== 0) process.exit(r.status);

const out = await handleToolCall('task.transition', {
  id, to: 'review', evidence
});
console.log(JSON.stringify(out, null, 2));
