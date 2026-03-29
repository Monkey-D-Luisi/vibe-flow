/**
 * Telegram MarkdownV2 message formatting utilities.
 * All special characters in user-supplied content must be escaped
 * before embedding in MarkdownV2 messages.
 */

export function escapeMarkdownV2(text: string): string {
  return text.replace(/([\\_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

export function formatTaskTransition(params: Record<string, unknown>): string {
  const taskId = String(params['taskId'] ?? 'unknown');
  const toStatus = String(params['toStatus'] ?? 'unknown');
  const agentId = String(params['agentId'] ?? 'system');
  return `📋 *Task ${escapeMarkdownV2(taskId)}* moved to \`${escapeMarkdownV2(toStatus)}\` by \`${escapeMarkdownV2(agentId)}\``;
}

export function formatPrCreation(params: Record<string, unknown>, result: unknown): string {
  const res = (result && typeof result === 'object') ? (result as Record<string, unknown>) : undefined;
  const prNumber = res?.['number'] ?? 'N/A';
  const title = String(res?.['title'] ?? params['title'] ?? 'Untitled');
  const url = String(res?.['url'] ?? '');
  if (url) {
    const safeUrl = url.replace(/[)\\]/g, '\\$&');
    return `🔀 *PR \\#${escapeMarkdownV2(String(prNumber))}* created: _${escapeMarkdownV2(title)}_ — [View](${safeUrl})`;
  }
  return `🔀 *PR \\#${escapeMarkdownV2(String(prNumber))}* created: _${escapeMarkdownV2(title)}_`;
}

export function formatQualityGate(_params: Record<string, unknown>, result: unknown): string {
  const res = (result && typeof result === 'object') ? (result as Record<string, unknown>) : undefined;

  // Try rich format first (quality_gate tool returns nested output)
  const output = res?.['output'] as Record<string, unknown> | undefined;
  if (output && typeof output === 'object') {
    return formatRichQualityGate(output);
  }

  // Fallback: simple format for qgate_gate or minimal results
  const passed = res?.['pass'] === true || res?.['passed'] === true;
  const emoji = passed ? '✅' : '❌';
  const verb = passed ? 'PASSED' : 'FAILED';
  const coverage = res?.['coverage'] != null ? ` \\(coverage: ${escapeMarkdownV2(String(res['coverage']))}%\\)` : '';
  return `${emoji} Quality gate *${verb}*${coverage}`;
}

/** Build a Unicode progress bar: ████████░░ */
export function buildProgressBar(pct: number, width: number = 10): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Determine check icon from result */
function checkIcon(passed: boolean): string {
  return passed ? '✅' : '❌';
}

/** Format a rich quality gate report card with progress bars and metrics. */
function formatRichQualityGate(output: Record<string, unknown>): string {
  const passed = output['passed'] === true;
  const metrics = (output['metrics'] && typeof output['metrics'] === 'object')
    ? output['metrics'] as Record<string, unknown>
    : {};
  const violations = Array.isArray(output['violations']) ? output['violations'] as Array<Record<string, unknown>> : [];
  const alerts = Array.isArray(output['alerts']) ? output['alerts'] as Array<Record<string, unknown>> : [];

  const header = passed
    ? '✅ *Quality Gate PASSED*'
    : '❌ *Quality Gate FAILED*';

  const lines: string[] = [header, ''];

  // Coverage
  const coverage = metrics['coverage'] as Record<string, unknown> | undefined;
  if (coverage && typeof coverage === 'object') {
    const pct = typeof coverage['lines'] === 'number' ? coverage['lines'] as number : 0;
    const bar = buildProgressBar(pct);
    lines.push(`📊 *Coverage:* \`${bar}\` ${escapeMarkdownV2(String(pct))}% ${checkIcon(pct >= 70)}`);
  }

  // Tests
  const tests = metrics['tests'] as Record<string, unknown> | undefined;
  if (tests && typeof tests === 'object') {
    const total = typeof tests['total'] === 'number' ? tests['total'] as number : 0;
    const failed = typeof tests['failed'] === 'number' ? tests['failed'] as number : 0;
    const testsPassed = failed === 0;
    lines.push(`🧪 *Tests:*  ${escapeMarkdownV2(String(total))} total, ${escapeMarkdownV2(String(failed))} failed ${checkIcon(testsPassed)}`);
  }

  // Lint
  const lint = metrics['lint'] as Record<string, unknown> | undefined;
  if (lint && typeof lint === 'object') {
    const errors = typeof lint['errors'] === 'number' ? lint['errors'] as number : 0;
    const warnings = typeof lint['warnings'] === 'number' ? lint['warnings'] as number : 0;
    const lintClean = errors === 0;
    lines.push(`🔍 *Lint:*    ${escapeMarkdownV2(String(errors))} errors, ${escapeMarkdownV2(String(warnings))} warnings ${checkIcon(lintClean)}`);
  }

  // Complexity
  const complexity = metrics['complexity'] as Record<string, unknown> | undefined;
  if (complexity && typeof complexity === 'object') {
    const avg = typeof complexity['avgCyclomatic'] === 'number' ? complexity['avgCyclomatic'] as number : 0;
    const max = typeof complexity['maxCyclomatic'] === 'number' ? complexity['maxCyclomatic'] as number : 0;
    const complexityOk = avg <= 5;
    lines.push(`🧩 *Complexity:* avg ${escapeMarkdownV2(String(avg.toFixed(1)))}, max ${escapeMarkdownV2(String(max))} ${checkIcon(complexityOk)}`);
  }

  // Violations summary
  if (violations.length > 0) {
    lines.push('');
    lines.push(`⚠️ *Violations \\(${escapeMarkdownV2(String(violations.length))}\\):*`);
    for (const v of violations.slice(0, 5)) {
      const code = escapeMarkdownV2(String(v['code'] ?? 'UNKNOWN'));
      const msg = escapeMarkdownV2(String(v['message'] ?? '').slice(0, 100));
      lines.push(`  • \`${code}\` ${msg}`);
    }
    if (violations.length > 5) {
      lines.push(`  _\\.\\.\\. and ${escapeMarkdownV2(String(violations.length - 5))} more_`);
    }
  }

  // Regression alerts
  if (alerts.length > 0) {
    lines.push('');
    lines.push('🚨 *Regression Alerts:*');
    for (const a of alerts.slice(0, 3)) {
      const reason = escapeMarkdownV2(String(a['reason'] ?? '').slice(0, 120));
      lines.push(`  • ${reason}`);
    }
  }

  return lines.join('\n');
}

export function formatAgentError(event: Record<string, unknown>): string {
  const agentId = String(event['agentId'] ?? 'unknown');
  const error = String(event['error'] ?? 'Unknown error');
  const sessionKey = typeof event['sessionKey'] === 'string'
    ? ` \\(session: \`${escapeMarkdownV2(event['sessionKey'] as string)}\`\\)`
    : '';
  return `⚠️ Agent \`${escapeMarkdownV2(agentId)}\` error: ${escapeMarkdownV2(error.slice(0, 200))}${sessionKey}`;
}

export function formatPipelineAdvance(details: Record<string, unknown>): string {
  const taskId = String(details['taskId'] ?? 'unknown');
  const prev = String(details['previousStage'] ?? '?');
  const curr = String(details['currentStage'] ?? '?');
  const owner = String(details['owner'] ?? 'system');
  const durationMs = typeof details['durationMs'] === 'number' ? details['durationMs'] as number : null;
  const durationStr = durationMs !== null ? ` \\(${escapeMarkdownV2(formatDurationMs(durationMs))}\\)` : '';
  return `🔄 Pipeline *${escapeMarkdownV2(prev)}* → *${escapeMarkdownV2(curr)}* \\(task \`${escapeMarkdownV2(taskId.slice(-8))}\`\\) — owner: \`${escapeMarkdownV2(owner)}\`${durationStr}`;
}

export function formatPipelineComplete(details: Record<string, unknown>): string {
  const taskId = String(details['taskId'] ?? 'unknown');
  const durationMs = typeof details['durationMs'] === 'number' ? details['durationMs'] as number : null;
  const durationStr = durationMs !== null ? ` Total stage: ${escapeMarkdownV2(formatDurationMs(durationMs))}\\.` : '';
  return `🏁 *Pipeline DONE\\!* Task \`${escapeMarkdownV2(taskId)}\` completed all stages\\.${durationStr}`;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
}
