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
  const passed = res?.['pass'] === true || res?.['passed'] === true;
  const emoji = passed ? '✅' : '❌';
  const verb = passed ? 'PASSED' : 'FAILED';
  const coverage = res?.['coverage'] != null ? ` \\(coverage: ${escapeMarkdownV2(String(res['coverage']))}%\\)` : '';
  return `${emoji} Quality gate *${verb}*${coverage}`;
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
