import { FastTrackResult, PostDevGuardResult } from './FastTrack.js';
import { TaskRecord } from './TaskRecord.js';
import { formatReason, formatHardBlock, formatRevocationReason } from './fastTrackMessages.js';

export function buildEvaluationComment(task: TaskRecord, result: FastTrackResult): string {
  const header = `## Fast-track evaluation for ${task.title}`;
  const summaryTable = [
    '| Metric | Value |',
    '| --- | --- |',
    `| Eligible | ${result.eligible ? 'YES' : 'NO'} |`,
    `| Score | ${result.score}/100 |`
  ].join('\n');

  const reasonsSection = result.reasons.length
    ? [``, '### Reasons', ...result.reasons.map(reason => `- ${formatReason(reason)}`)].join('\n')
    : '';

  const blocksSection = result.hardBlocks.length
    ? [``, '### Hard blocks', ...result.hardBlocks.map(block => `- ${formatHardBlock(block)}`)].join('\n')
    : '';

  const footer = result.eligible
    ? '\nFast-track approved. The task can move directly to Development.'
    : '\nFast-track blocked. Continue with the Architecture review path.';

  return [header, summaryTable, reasonsSection, blocksSection, footer].filter(Boolean).join('\n').trim();
}

export function buildRevocationComment(task: TaskRecord, guardResult: PostDevGuardResult): string {
  return [
    `## Fast-track revoked for ${task.title}`,
    `**Reason:** ${formatRevocationReason(guardResult.reason ?? 'unknown')}`,
    '',
    'The task must continue through the standard Architecture review.',
    'Fast-track status was revoked after the development guard checks.'
  ].join('\n');
}

export function buildPullRequestBody(task: TaskRecord, result: FastTrackResult): string {
  const eligibilitySection = result.eligible
    ? `**Fast-track score:** ${result.score}/100`
    : [
        '**Fast-track blocked**',
        result.hardBlocks.length ? result.hardBlocks.map(block => `- ${formatHardBlock(block)}`).join('\n') : 'No hard blocks reported.'
      ].join('\n');

  return [
    `## ${task.title}`,
    `**Task ID:** ${task.id}`,
    `**Scope:** ${task.scope}`,
    '',
    eligibilitySection,
    '',
    '**Acceptance criteria**',
    ...(task.acceptance_criteria ?? []).map(ac => `- ${ac}`)
  ].join('\n');
}