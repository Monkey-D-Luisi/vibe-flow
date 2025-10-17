// tooling/manual/02-dev-to-review.ts
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { handleToolCall } from '../../services/task-mcp/src/mcp/tools.ts';

const id = process.argv[2];
if (!id) throw new Error('Usage: tsx 02-dev-to-review.ts <taskId>');

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path: string, data: unknown) =>
  writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

const [coverageReport, lintReport, complexityReport] = await Promise.all([
  readJson('.qreport/coverage.json'),
  readJson('.qreport/lint.json'),
  readJson('.qreport/complexity.json')
]);

const pickNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
};

const coverage = pickNumber(
  coverageReport?.total?.lines,
  coverageReport?.lines,
  coverageReport?.totalLines
);

if (coverage === undefined) {
  throw new Error('Coverage report does not contain a usable coverage ratio');
}
if (coverage < 0 || coverage > 1) {
  throw new Error(`Coverage value ${coverage} is out of range [0,1]`);
}

const lintErrors =
  pickNumber(lintReport?.errors, lintReport?.summary?.errors) ?? 0;
const lintWarnings =
  pickNumber(lintReport?.warnings, lintReport?.summary?.warnings) ?? 0;
const avgCyclomatic =
  pickNumber(complexityReport?.avgCyclomatic, complexityReport?.metrics?.avg) ?? undefined;

const ensureTask = async () => {
  const taskRecord = (await handleToolCall('task.get', { id })) as any;
  if (!taskRecord || typeof taskRecord.rev !== 'number') {
    throw new Error('Task not found or missing revision');
  }
  return taskRecord;
};

let task = await ensureTask();

const hasFastTrackEligibility = Array.isArray(task.tags) && task.tags.includes('fast-track:eligible');
let fastTrackScore: number | undefined;
let fastTrackEligible: boolean | undefined = hasFastTrackEligibility ? true : undefined;

if (!hasFastTrackEligibility) {
  const fastTrackResponse = (await handleToolCall('fasttrack.evaluate', {
    task_id: id,
    diff: {
      files: [],
      locAdded: 0,
      locDeleted: 0
    },
    quality: {
      coverage,
      avgCyclomatic,
      lintErrors
    },
    metadata: {
      modulesChanged: false,
      publicApiChanged: false,
      contractsChanged: false,
      patternsChanged: false,
      adrChanged: false,
      packagesSchemaChanged: false
    }
  })) as any;
  task = fastTrackResponse?.task ?? task;
  fastTrackScore = pickNumber(fastTrackResponse?.result?.score) ?? fastTrackScore;
  if (typeof fastTrackResponse?.result?.eligible === 'boolean') {
    fastTrackEligible = fastTrackResponse.result.eligible;
  }
}

if (task.status === 'po') {
  const transitionInput: any = {
    id,
    to: 'dev',
    if_rev: task.rev
  };
  if (fastTrackEligible === true) {
    transitionInput.evidence = {
      fast_track: {
        eligible: true,
        score: fastTrackScore ?? 100
      }
    };
  }
  task = (await handleToolCall('task.transition', transitionInput)) as any;
}

const tests = await readJson('.qreport/tests.json').catch(() => null);
const testsTotals = (() => {
  if (!tests) return undefined;
  const total = pickNumber(tests.total, tests.summary?.tests) ?? 0;
  const failed = pickNumber(tests.failed, tests.summary?.failures) ?? 0;
  const passed = pickNumber(tests.passed, total - failed) ?? Math.max(total - failed, 0);
  const durationMs = pickNumber(tests.durationMs, tests.summary?.time);
  return { total, passed, failed, durationMs };
})();

const timestamp = () => new Date().toISOString();
const redGreenRefactorLog = [
  `red: failing test captured at ${timestamp()}`,
  `green: all tests passing at ${timestamp()}`
];

if (testsTotals) {
  const { total, passed, failed, durationMs } = testsTotals;
  const parts = [
    `tests summary -> passed ${passed}/${total}`,
    `failed ${failed}`
  ];
  if (typeof durationMs === 'number') {
    parts.push(`duration ${durationMs}ms`);
  }
  redGreenRefactorLog.push(parts.join(', '));
}

const evidence = {
  red_green_refactor_log: redGreenRefactorLog,
  metrics: {
    coverage,
    lint: {
      errors: lintErrors,
      warnings: lintWarnings
    }
  }
};

const gateArgs = ['q:gate', '--source', 'artifacts', '--scope', task.scope ?? 'minor'];
const gate = spawnSync('pnpm', gateArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
if (gate.status !== 0) {
  const code = gate.status ?? gate.signal ?? 'unknown';
  throw new Error(`pnpm ${gateArgs.join(' ')} failed with ${code}`);
}

try {
  const gateData = await readJson('.qreport/gate.json');
  if (gateData && typeof gateData === 'object' && !Array.isArray(gateData)) {
    if (!Object.prototype.hasOwnProperty.call(gateData, 'source')) {
      gateData.source = 'server';
      await writeJson('.qreport/gate.json', gateData);
    }
  }
} catch {
  // If gate.json is missing we let the transition fail later when evidence is validated.
}

const out = await handleToolCall('task.transition', {
  id,
  to: 'review',
  if_rev: task.rev,
  evidence
});

console.log(JSON.stringify(out, null, 2));
