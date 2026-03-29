/**
 * Inline Keyboard Buttons for Decision Approval/Rejection.
 *
 * Builds rich decision cards with inline keyboard buttons so the human
 * operator can see available options at a glance. Buttons encode the
 * decision ID and option in callback_data for future callback handling.
 * Slash commands are included as fallback action text.
 *
 * Task 0142 (EP21)
 */

import { escapeMarkdownV2 } from './formatting.js';

/** Inline button matching Telegram Bot API shape. */
export interface InlineButton {
  readonly text: string;
  readonly callback_data: string;
}

/** 2D array of inline buttons (rows × columns). */
export type InlineButtonGrid = ReadonlyArray<ReadonlyArray<InlineButton>>;

/** Parsed decision data for rendering. */
export interface DecisionCardData {
  readonly decisionId: string;
  readonly category: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly approver: string | null;
  readonly agentId?: string;
  readonly taskId?: string;
  readonly budgetPct?: number;
  readonly activePipelines?: number;
}

/**
 * Build inline keyboard buttons for a decision.
 *
 * Layout:
 *   Row per option: [✅ Approve: <option>]
 *   Final row:      [❌ Reject]
 *
 * callback_data format:
 *   - `dec:approve:<decisionId>:<optionId>`
 *   - `dec:reject:<decisionId>`
 *
 * Telegram limits callback_data to 64 bytes, so IDs are truncated if needed.
 */
export function buildDecisionButtons(decisionId: string, options: readonly string[]): InlineButtonGrid {
  const shortId = decisionId.length > 20 ? decisionId.slice(-20) : decisionId;
  const rows: InlineButton[][] = [];

  for (const option of options) {
    const shortOption = option.length > 16 ? option.slice(0, 16) : option;
    const callbackData = `dec:approve:${shortId}:${shortOption}`;
    // Telegram enforces 64-byte limit on callback_data
    const safeCallback = callbackData.length > 64 ? callbackData.slice(0, 64) : callbackData;
    rows.push([{
      text: `✅ ${option}`,
      callback_data: safeCallback,
    }]);
  }

  rows.push([{
    text: '❌ Reject',
    callback_data: `dec:reject:${shortId}`,
  }]);

  return rows;
}

/**
 * Format a rich decision card for Telegram MarkdownV2.
 *
 * Includes category, question, context data (budget, pipelines),
 * and fallback slash commands for operators who prefer typing.
 */
export function formatDecisionCard(data: DecisionCardData): string {
  const lines: string[] = [];
  const eid = escapeMarkdownV2;

  lines.push(`⚡ *Decision Escalated*`);
  lines.push('');
  lines.push(`📋 *ID:* \`${eid(data.decisionId)}\``);
  lines.push(`🏷 *Category:* ${eid(data.category)}`);

  if (data.taskId) {
    lines.push(`🔗 *Task:* \`${eid(data.taskId)}\``);
  }
  if (data.agentId) {
    lines.push(`🤖 *From:* \`${eid(data.agentId)}\``);
  }

  lines.push('');
  lines.push(`❓ ${eid(data.question)}`);

  // Context section
  if (data.budgetPct !== undefined || data.activePipelines !== undefined) {
    lines.push('');
    lines.push('📊 *Context:*');
    if (data.budgetPct !== undefined) {
      lines.push(`  Budget: ${data.budgetPct}% used`);
    }
    if (data.activePipelines !== undefined) {
      lines.push(`  Pipelines: ${data.activePipelines} active`);
    }
  }

  // Options list
  if (data.options.length > 0) {
    lines.push('');
    lines.push('🔘 *Options:*');
    for (const opt of data.options) {
      lines.push(`  • ${eid(opt)}`);
    }
  }

  // Fallback commands
  lines.push('');
  lines.push('_Tap a button or use:_');
  if (data.options.length > 0) {
    lines.push(`\`/approve ${eid(data.decisionId)} ${eid(data.options[0]!)}\``);
  }
  lines.push(`\`/reject ${eid(data.decisionId)} reason\``);

  return lines.join('\n');
}

/**
 * Extract decision card data from a decision_evaluate result.
 *
 * Normalizes the varied shapes returned by the decision tool into
 * a consistent DecisionCardData structure.
 */
export function extractDecisionData(
  params: Record<string, unknown>,
  result: Record<string, unknown>,
): DecisionCardData | null {
  const details = (result['details'] && typeof result['details'] === 'object')
    ? result['details'] as Record<string, unknown>
    : result;

  if (details['escalated'] !== true) return null;

  const decisionId = String(details['decisionId'] ?? params['decisionId'] ?? 'unknown');
  const category = String(details['category'] ?? params['category'] ?? 'general');
  const question = String(details['question'] ?? params['question'] ?? '');
  const approver = details['approver'] != null ? String(details['approver']) : null;
  const agentId = params['agentId'] != null ? String(params['agentId']) : undefined;
  const taskId = params['taskId'] != null ? String(params['taskId']) : undefined;

  // Extract options array
  const rawOptions = details['options'] ?? params['options'];
  const options: string[] = [];
  if (Array.isArray(rawOptions)) {
    for (const opt of rawOptions) {
      if (typeof opt === 'string') {
        options.push(opt);
      } else if (opt && typeof opt === 'object' && 'id' in opt) {
        options.push(String((opt as Record<string, unknown>)['id']));
      }
    }
  }

  // If no options extracted, provide a default
  if (options.length === 0) {
    options.push('approve');
  }

  return { decisionId, category, question, options, approver, agentId, taskId };
}
