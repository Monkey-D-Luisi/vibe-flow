/**
 * Collaborative Review Loop Protocol
 *
 * Orchestrates the review → fix → re-review cycle between tech-lead and
 * implementor. When review violations are found, the protocol formats an
 * actionable repair brief that routes back to the implementor with:
 *
 * - Categorised violations with severity markers
 * - Specific fix instructions extracted from review data
 * - Round history tracking improvements across iterations
 * - Escalation detection when max rounds are reached
 *
 * EP21 Task 0146
 */

export interface ReviewViolation {
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly suggestion?: string;
}

export interface ReviewRound {
  readonly round: number;
  readonly violations: readonly ReviewViolation[];
  readonly summary?: string;
  readonly timestamp: string;
}

export interface ReviewLoopState {
  readonly taskId: string;
  readonly title: string;
  readonly currentRound: number;
  readonly maxRounds: number;
  readonly rounds: readonly ReviewRound[];
}

export interface ReviewLoopConfig {
  readonly maxRounds: number;
}

export const DEFAULT_REVIEW_LOOP_CONFIG: ReviewLoopConfig = {
  maxRounds: 3,
};

const SEVERITY_ICONS: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '⚪',
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Parse raw review result metadata into typed violations.
 */
export function parseReviewViolations(
  reviewResult: Record<string, unknown>,
): ReviewViolation[] {
  const raw = reviewResult['violations'];
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => ({
      severity: normaliseSeverity(v['severity']),
      message: typeof v['message'] === 'string' ? v['message'] : 'Unknown violation',
      file: typeof v['file'] === 'string' ? v['file'] : undefined,
      line: typeof v['line'] === 'number' ? v['line'] : undefined,
      suggestion: typeof v['suggestion'] === 'string' ? v['suggestion'] : undefined,
    }));
}

function normaliseSeverity(raw: unknown): ReviewViolation['severity'] {
  if (typeof raw !== 'string') return 'medium';
  const s = raw.toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low') return s;
  return 'medium';
}

/**
 * Build a review loop state from task metadata.
 */
export function buildReviewLoopState(
  taskId: string,
  title: string,
  currentRound: number,
  maxRounds: number,
  reviewHistory: readonly ReviewRound[],
): ReviewLoopState {
  return {
    taskId,
    title,
    currentRound,
    maxRounds,
    rounds: reviewHistory,
  };
}

/**
 * Format an actionable repair brief for the implementor.
 *
 * Groups violations by severity and provides clear fix instructions.
 */
export function formatRepairBrief(
  state: ReviewLoopState,
  violations: readonly ReviewViolation[],
): string {
  const lines: string[] = [];

  lines.push(`## Review Round ${state.currentRound}/${state.maxRounds} — Repair Brief`);
  lines.push('');
  lines.push(`**Task:** ${state.taskId} — ${state.title}`);
  lines.push('');

  // Group by severity, sorted by severity order
  const grouped = new Map<string, ReviewViolation[]>();
  for (const v of violations) {
    const list = grouped.get(v.severity) ?? [];
    list.push(v);
    grouped.set(v.severity, list);
  }

  const sortedSeverities = [...grouped.keys()].sort(
    (a, b) => (SEVERITY_ORDER[a] ?? 99) - (SEVERITY_ORDER[b] ?? 99),
  );

  // Summary counts
  const counts = sortedSeverities
    .map((s) => `${SEVERITY_ICONS[s] ?? '⚪'} ${grouped.get(s)?.length ?? 0} ${s}`)
    .join(' | ');
  lines.push(`**Findings:** ${counts}`);
  lines.push('');

  // Detailed violations per severity
  for (const severity of sortedSeverities) {
    const items = grouped.get(severity) ?? [];
    const icon = SEVERITY_ICONS[severity] ?? '⚪';
    lines.push(`### ${icon} ${severity.toUpperCase()} (${items.length})`);
    lines.push('');

    for (const v of items) {
      const location = v.file
        ? v.line ? `\`${v.file}:${v.line}\`` : `\`${v.file}\``
        : '';
      lines.push(`- ${v.message}${location ? ` — ${location}` : ''}`);
      if (v.suggestion) {
        lines.push(`  → **Fix:** ${v.suggestion}`);
      }
    }
    lines.push('');
  }

  // Round history comparison if previous rounds exist
  if (state.rounds.length > 1) {
    const prev = state.rounds[state.rounds.length - 2];
    const prevCount = prev.violations.length;
    const currCount = violations.length;
    const delta = currCount - prevCount;
    const trend = delta < 0 ? `↓ ${Math.abs(delta)} fewer` : delta > 0 ? `↑ ${delta} more` : '→ same count';
    lines.push(`**Trend:** ${trend} findings vs round ${prev.round}`);
    lines.push('');
  }

  // Instructions
  lines.push('---');
  lines.push('**Action Required:**');
  lines.push(`Fix all ${SEVERITY_ICONS['critical'] ?? ''} critical and ${SEVERITY_ICONS['high'] ?? ''} high violations before re-submitting for review.`);
  lines.push(`Low and medium findings should be addressed but will not block advancement.`);

  return lines.join('\n');
}

/**
 * Build a review round summary for tracking history.
 */
export function buildReviewRound(
  round: number,
  violations: readonly ReviewViolation[],
  summary?: string,
): ReviewRound {
  return {
    round,
    violations,
    summary,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Determine if the review loop has reached its limit.
 */
export function isReviewLoopExhausted(state: ReviewLoopState): boolean {
  return state.currentRound >= state.maxRounds;
}

/**
 * Format an escalation message when max review rounds are exceeded.
 */
export function formatEscalationMessage(state: ReviewLoopState): string {
  const lines: string[] = [];

  lines.push(`## ⚠️ Review Loop Exhausted — Escalation Required`);
  lines.push('');
  lines.push(`**Task:** ${state.taskId} — ${state.title}`);
  lines.push(`**Rounds completed:** ${state.currentRound}/${state.maxRounds}`);
  lines.push('');

  // Show progression across rounds
  if (state.rounds.length > 0) {
    lines.push('**Round History:**');
    for (const round of state.rounds) {
      const critHigh = round.violations.filter(
        (v) => v.severity === 'critical' || v.severity === 'high',
      ).length;
      const total = round.violations.length;
      lines.push(`- Round ${round.round}: ${total} findings (${critHigh} critical/high)`);
    }
    lines.push('');
  }

  lines.push('**Required Action:** Manual review by tech-lead. Consider:');
  lines.push('- Pairing session between reviewer and implementor');
  lines.push('- Breaking the task into smaller, reviewable units');
  lines.push('- Reassigning to a different implementor');

  return lines.join('\n');
}

/**
 * Extract and count blocking violations (high + critical).
 */
export function countBlockingViolations(violations: readonly ReviewViolation[]): number {
  return violations.filter(
    (v) => v.severity === 'critical' || v.severity === 'high',
  ).length;
}

/**
 * Extract review round history from task metadata.
 */
export function extractReviewHistory(meta: Record<string, unknown>): ReviewRound[] {
  const raw = meta['reviewHistory'];
  if (!Array.isArray(raw)) return [];

  return raw.filter(
    (r): r is Record<string, unknown> => typeof r === 'object' && r !== null,
  ).map((r) => ({
    round: typeof r['round'] === 'number' ? r['round'] : 0,
    violations: parseReviewViolations(r as Record<string, unknown>),
    summary: typeof r['summary'] === 'string' ? r['summary'] : undefined,
    timestamp: typeof r['timestamp'] === 'string' ? r['timestamp'] : new Date().toISOString(),
  }));
}

/**
 * Build review repair context for a stage spawn message.
 *
 * When a task returns to IMPLEMENTATION from REVIEW, produces a repair brief
 * or escalation message with the violations that need fixing.
 *
 * @param stage - Target stage being spawned
 * @param meta - Task metadata containing review_result and history
 * @param taskId - Task ID for the repair brief header
 * @param title - Task title for the repair brief header
 */
export function buildReviewContextForSpawn(
  stage: string,
  meta: Record<string, unknown>,
  taskId: string,
  title: string,
): string | null {
  if (stage !== 'IMPLEMENTATION') return null;

  const reviewResult = meta['review_result'];
  if (!reviewResult || typeof reviewResult !== 'object' || reviewResult === null) return null;

  const violations = parseReviewViolations(reviewResult as Record<string, unknown>);
  if (violations.length === 0) return null;

  const roundsReview = typeof meta['roundsReview'] === 'number' ? meta['roundsReview'] : 1;
  const maxRounds = typeof meta['maxReviewRounds'] === 'number' ? meta['maxReviewRounds'] : 3;

  const history = extractReviewHistory(meta);
  const currentRound = buildReviewRound(roundsReview, violations);
  const allRounds = [...history, currentRound];

  const state = buildReviewLoopState(taskId, title, roundsReview, maxRounds, allRounds);

  if (isReviewLoopExhausted(state)) {
    return formatEscalationMessage(state);
  }

  return formatRepairBrief(state, violations);
}
