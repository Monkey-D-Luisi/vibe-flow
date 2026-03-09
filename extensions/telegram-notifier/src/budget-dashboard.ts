/**
 * Telegram /budget real-time dashboard.
 *
 * Renders budget consumption across global, pipeline, and agent scopes
 * using Unicode block progress bars. Supports replenish/reset subcommands.
 *
 * EP11 Task 0087
 */

import { escapeMarkdownV2 } from './formatting.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BudgetRecord {
  readonly id: string;
  scope: string;
  scopeId: string;
  limitTokens: number;
  consumedTokens: number;
  limitUsd: number;
  consumedUsd: number;
  status: string;
  warningThreshold: number;
  rev: number;
}

/** Minimal interface for accessing budget records (dependency injection). */
export interface BudgetDataSource {
  getByScope(scope: string, scopeId: string): BudgetRecord | null;
  listByScope(scope: string): BudgetRecord[];
  replenish(
    id: string,
    additionalTokens: number,
    additionalUsd: number,
    expectedRev: number,
    now: string,
  ): BudgetRecord;
  resetConsumption(id: string, expectedRev: number, now: string): BudgetRecord;
}

/* ------------------------------------------------------------------ */
/*  Progress bar rendering                                             */
/* ------------------------------------------------------------------ */

const ALL_BUDGET_SCOPES = ['global', 'pipeline', 'stage', 'agent'] as const;

const BAR_LENGTH = 10;
const FILLED = '\u2588'; // █
const EMPTY = '\u2591';  // ░

/**
 * Render a Unicode progress bar for a consumption ratio.
 * Ratio is clamped to [0, 1] for display.
 */
export function renderProgressBar(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * BAR_LENGTH);
  return FILLED.repeat(filled) + EMPTY.repeat(BAR_LENGTH - filled);
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function pctString(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function consumptionRatio(record: BudgetRecord): number {
  const tokenRatio =
    record.limitTokens > 0 ? record.consumedTokens / record.limitTokens : 0;
  const usdRatio =
    record.limitUsd > 0 ? record.consumedUsd / record.limitUsd : 0;
  return Math.max(tokenRatio, usdRatio);
}

function warningIndicator(record: BudgetRecord): string {
  const ratio = consumptionRatio(record);
  if (record.status === 'exhausted') return ' \u274C';
  if (ratio >= record.warningThreshold) return ' \u26A0\uFE0F';
  return '';
}

function budgetLabel(record: BudgetRecord): string {
  if (record.limitUsd > 0) {
    return `${formatUsd(record.consumedUsd)} / ${formatUsd(record.limitUsd)}`;
  }
  return `${record.consumedTokens.toLocaleString('en-US')} / ${record.limitTokens.toLocaleString('en-US')} tokens`;
}

function formatBudgetLine(label: string, record: BudgetRecord): string {
  const ratio = consumptionRatio(record);
  const bar = renderProgressBar(ratio);
  const pct = pctString(ratio);
  const warn = warningIndicator(record);
  const cost = budgetLabel(record);
  return `  ${label}: ${bar} ${pct} \\(${escapeMarkdownV2(cost)}\\)${escapeMarkdownV2(warn)}`;
}

/* ------------------------------------------------------------------ */
/*  Agent scope ID parsing                                             */
/* ------------------------------------------------------------------ */

function parseAgentScopeId(scopeId: string): { pipelineId: string; agentId: string } | null {
  const sep = scopeId.indexOf('::');
  if (sep === -1) return null;
  return {
    pipelineId: scopeId.slice(0, sep),
    agentId: scopeId.slice(sep + 2),
  };
}

/* ------------------------------------------------------------------ */
/*  Dashboard rendering                                                */
/* ------------------------------------------------------------------ */

export function renderDashboard(ds: BudgetDataSource): string {
  const lines: string[] = [];
  lines.push('\uD83D\uDCCA *Budget Dashboard*');
  lines.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');

  // Global budget
  const global = ds.getByScope('global', 'default');
  if (global) {
    lines.push(formatBudgetLine('Global', global));
  } else {
    lines.push('  Global: _No budget configured_');
  }

  // Pipeline budgets (show the most recent active one)
  const pipelines = ds.listByScope('pipeline');
  if (pipelines.length > 0) {
    const latest = pipelines[pipelines.length - 1]!;
    lines.push(formatBudgetLine('Pipeline', latest));

    // Per-agent budgets within that pipeline
    const agents = ds.listByScope('agent');
    const pipelineAgents = agents.filter((a) => {
      const parsed = parseAgentScopeId(a.scopeId);
      return parsed !== null && parsed.pipelineId === latest.scopeId;
    });

    if (pipelineAgents.length > 0) {
      lines.push('');
      lines.push('*Per\\-Agent \\(current pipeline\\):*');
      for (const agent of pipelineAgents) {
        const parsed = parseAgentScopeId(agent.scopeId);
        const agentName = parsed ? parsed.agentId : agent.scopeId;
        lines.push(formatAgentLine(agentName, agent));
      }
    }
  } else {
    lines.push('  Pipeline: _No active pipeline_');
  }

  return lines.join('\n');
}

function formatAgentLine(agentName: string, record: BudgetRecord): string {
  const ratio = consumptionRatio(record);
  const bar = renderProgressBar(ratio);
  const pct = pctString(ratio);
  const warn = warningIndicator(record);
  const cost = budgetLabel(record);
  const padded = escapeMarkdownV2(agentName.padEnd(10));
  return `  ${padded} ${bar} ${pct} \\(${escapeMarkdownV2(cost)}\\)${escapeMarkdownV2(warn)}`;
}

/* ------------------------------------------------------------------ */
/*  Subcommand parsing and execution                                   */
/* ------------------------------------------------------------------ */

export interface SubcommandResult {
  text: string;
}

export function handleBudgetCommand(
  args: string,
  ds: BudgetDataSource,
  now: () => string,
): SubcommandResult {
  const trimmed = args.trim();

  // No args → show dashboard
  if (!trimmed) {
    return { text: renderDashboard(ds) };
  }

  const parts = trimmed.split(/\s+/);
  const subcommand = parts[0]!.toLowerCase();

  if (subcommand === 'replenish') {
    return handleReplenish(parts.slice(1), ds, now);
  }

  if (subcommand === 'reset') {
    return handleReset(parts.slice(1), ds, now);
  }

  return {
    text: [
      'Usage:',
      '  `/budget` \\- show dashboard',
      '  `/budget replenish <scope> <scopeId> <amount>` \\- add tokens',
      '  `/budget reset agent <agentScopeId>` \\- reset agent budget',
    ].join('\n'),
  };
}

function handleReplenish(
  parts: string[],
  ds: BudgetDataSource,
  now: () => string,
): SubcommandResult {
  // /budget replenish <scope> <scopeId> <amount>
  if (parts.length < 3) {
    return { text: 'Usage: `/budget replenish <scope> <scopeId> <amount>`\n\nExample: `/budget replenish global default 10000`' };
  }

  const scope = parts[0]!;
  const scopeId = parts[1]!;
  const rawAmount = parts[2]!;

  if (!(ALL_BUDGET_SCOPES as readonly string[]).includes(scope)) {
    return { text: `Invalid scope: \`${escapeMarkdownV2(scope)}\`\\. Valid: ${ALL_BUDGET_SCOPES.join(', ')}` };
  }

  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return { text: `Invalid amount: \`${escapeMarkdownV2(rawAmount)}\`\\. Must be a positive integer\\.` };
  }

  const record = ds.getByScope(scope, scopeId);
  if (!record) {
    return { text: `No budget record found for scope \`${escapeMarkdownV2(scope)}\` / \`${escapeMarkdownV2(scopeId)}\`\\.` };
  }

  try {
    const updated = ds.replenish(record.id, amount, 0, record.rev, now());
    const ratio = consumptionRatio(updated);
    return {
      text: `\u2705 Replenished \`${escapeMarkdownV2(scope)}\`/\`${escapeMarkdownV2(scopeId)}\` by ${amount.toLocaleString('en-US')} tokens\\. New status: ${escapeMarkdownV2(updated.status)} \\(${pctString(ratio)}\\)`,
    };
  } catch (err: unknown) {
    return { text: `\u26A0\uFE0F Replenish failed: ${escapeMarkdownV2(String(err))}` };
  }
}

function handleReset(
  parts: string[],
  ds: BudgetDataSource,
  now: () => string,
): SubcommandResult {
  // /budget reset agent <agentScopeId>
  if (parts.length < 2 || parts[0]!.toLowerCase() !== 'agent') {
    return { text: 'Usage: `/budget reset agent <agentScopeId>`\n\nExample: `/budget reset agent PL001::back\\-1`' };
  }

  const agentScopeId = parts[1]!;

  const record = ds.getByScope('agent', agentScopeId);
  if (!record) {
    return { text: `No agent budget record found for \`${escapeMarkdownV2(agentScopeId)}\`\\.` };
  }

  try {
    ds.resetConsumption(record.id, record.rev, now());
    return {
      text: `\u2705 Agent budget \`${escapeMarkdownV2(agentScopeId)}\` reset to zero consumption\\.`,
    };
  } catch (err: unknown) {
    return { text: `\u26A0\uFE0F Reset failed: ${escapeMarkdownV2(String(err))}` };
  }
}
