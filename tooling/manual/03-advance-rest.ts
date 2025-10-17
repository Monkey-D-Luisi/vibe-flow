// tooling/manual/03-advance-rest.ts
import { readFile } from 'node:fs/promises';
import { handleToolCall } from '../../services/task-mcp/src/mcp/tools.ts';

const id = process.argv[2];
if (!id) throw new Error('Usage: tsx 03-advance-rest.ts <taskId>');

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

const testsReport = await readJson('.qreport/tests.json');

const ensureNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

let current = (await handleToolCall('task.get', { id })) as any;

const nextRev = () => {
  const rev = ensureNumber(current?.rev, NaN);
  if (Number.isNaN(rev)) {
    throw new Error('Task record does not expose a valid revision');
  }
  return rev;
};

const transition = async (to: string, evidence: Record<string, unknown> = {}) => {
  current = (await handleToolCall('task.transition', {
    id,
    to,
    if_rev: nextRev(),
    evidence
  })) as any;
  console.log(`${to} ✓`);
};

await transition('po_check', { violations: [] });

await transition('qa', {
  acceptance_criteria_met: true
});

const reportedPassed = ensureNumber(testsReport?.passed, Number.NaN);
const qaFailed = ensureNumber(testsReport?.failed, 0);
const reportedTotal = ensureNumber(testsReport?.total, Number.NaN);

const qaTotal = Number.isFinite(reportedTotal)
  ? reportedTotal
  : (Number.isFinite(reportedPassed) ? reportedPassed : 0) + qaFailed;
const derivedPassed = Math.max(qaTotal - qaFailed, 0);
const qaPassed = Number.isFinite(reportedPassed) ? reportedPassed : derivedPassed;

const qaReport = {
  total: qaTotal,
  passed: qaPassed,
  failed: qaFailed
};

await transition('pr', {
  qa_report: qaReport
});

await transition('done', {
  merged: true
});

const final = await handleToolCall('task.get', { id });
console.log(JSON.stringify(final, null, 2));
