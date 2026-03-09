import { describe, it, expect, vi } from 'vitest';
import {
  renderProgressBar,
  renderDashboard,
  handleBudgetCommand,
  type BudgetRecord,
  type BudgetDataSource,
} from '../src/budget-dashboard.js';

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

function makeBudget(overrides: Partial<BudgetRecord> = {}): BudgetRecord {
  return {
    id: 'B001',
    scope: 'global',
    scopeId: 'default',
    limitTokens: 100_000,
    consumedTokens: 0,
    limitUsd: 4.0,
    consumedUsd: 0,
    status: 'active',
    warningThreshold: 0.8,
    rev: 0,
    ...overrides,
  };
}

function createMockDs(records: BudgetRecord[] = []): BudgetDataSource {
  return {
    getByScope: vi.fn((scope: string, scopeId: string) =>
      records.find((r) => r.scope === scope && r.scopeId === scopeId) ?? null,
    ),
    listByScope: vi.fn((scope: string) =>
      records.filter((r) => r.scope === scope),
    ),
    replenish: vi.fn(
      (id: string, additionalTokens: number, _additionalUsd: number, _expectedRev: number, _now: string) => {
        const record = records.find((r) => r.id === id);
        if (!record) throw new Error('Not found');
        return {
          ...record,
          limitTokens: record.limitTokens + additionalTokens,
          status: 'active' as const,
          rev: record.rev + 1,
        };
      },
    ),
    resetConsumption: vi.fn((id: string, _expectedRev: number, _now: string) => {
      const record = records.find((r) => r.id === id);
      if (!record) throw new Error('Not found');
      return {
        ...record,
        consumedTokens: 0,
        consumedUsd: 0,
        status: 'active' as const,
        rev: record.rev + 1,
      };
    }),
  };
}

const fixedNow = () => '2026-03-09T12:00:00Z';

/* ------------------------------------------------------------------ */
/*  renderProgressBar                                                  */
/* ------------------------------------------------------------------ */

describe('renderProgressBar', () => {
  it('renders empty bar for 0%', () => {
    const bar = renderProgressBar(0);
    expect(bar).toBe('\u2591'.repeat(10));
    expect(bar.length).toBe(10);
  });

  it('renders full bar for 100%', () => {
    const bar = renderProgressBar(1.0);
    expect(bar).toBe('\u2588'.repeat(10));
  });

  it('renders half bar for 50%', () => {
    const bar = renderProgressBar(0.5);
    expect(bar).toBe('\u2588'.repeat(5) + '\u2591'.repeat(5));
  });

  it('clamps ratio above 1 to full bar', () => {
    const bar = renderProgressBar(1.5);
    expect(bar).toBe('\u2588'.repeat(10));
  });

  it('clamps negative ratio to empty bar', () => {
    const bar = renderProgressBar(-0.3);
    expect(bar).toBe('\u2591'.repeat(10));
  });

  it('renders 80% (8 filled blocks)', () => {
    const bar = renderProgressBar(0.8);
    expect(bar).toBe('\u2588'.repeat(8) + '\u2591'.repeat(2));
  });
});

/* ------------------------------------------------------------------ */
/*  renderDashboard                                                    */
/* ------------------------------------------------------------------ */

describe('renderDashboard', () => {
  it('renders "No budget configured" when no records exist', () => {
    const ds = createMockDs([]);
    const text = renderDashboard(ds);
    expect(text).toContain('Budget Dashboard');
    expect(text).toContain('No budget configured');
    expect(text).toContain('No active pipeline');
  });

  it('renders global budget with progress bar', () => {
    const ds = createMockDs([
      makeBudget({
        scope: 'global',
        scopeId: 'default',
        consumedTokens: 78_000,
        limitTokens: 100_000,
        consumedUsd: 3.12,
        limitUsd: 4.0,
        status: 'active',
      }),
    ]);
    const text = renderDashboard(ds);
    expect(text).toContain('Global');
    expect(text).toContain('78%');
    // Periods are escaped for MarkdownV2
    expect(text).toContain('$3\\.12');
    expect(text).toContain('$4\\.00');
  });

  it('renders pipeline budget', () => {
    const ds = createMockDs([
      makeBudget({ scope: 'global', scopeId: 'default' }),
      makeBudget({
        id: 'B002',
        scope: 'pipeline',
        scopeId: 'PL001',
        consumedTokens: 62_000,
        limitTokens: 100_000,
        consumedUsd: 1.24,
        limitUsd: 2.0,
        status: 'active',
      }),
    ]);
    const text = renderDashboard(ds);
    expect(text).toContain('Pipeline');
    expect(text).toContain('62%');
  });

  it('renders per-agent budgets within the current pipeline', () => {
    const records = [
      makeBudget({ scope: 'global', scopeId: 'default' }),
      makeBudget({
        id: 'B002',
        scope: 'pipeline',
        scopeId: 'PL001',
        limitTokens: 100_000,
        consumedTokens: 50_000,
      }),
      makeBudget({
        id: 'B003',
        scope: 'agent',
        scopeId: 'PL001::back-1',
        limitTokens: 25_000,
        consumedTokens: 14_500,
        limitUsd: 0,
      }),
      makeBudget({
        id: 'B004',
        scope: 'agent',
        scopeId: 'PL001::tech-lead',
        limitTokens: 15_000,
        consumedTokens: 12_300,
        limitUsd: 0,
        status: 'warning',
        warningThreshold: 0.8,
      }),
    ];
    const ds = createMockDs(records);
    const text = renderDashboard(ds);
    expect(text).toContain('Per\\-Agent');
    expect(text).toContain('back\\-1');
    expect(text).toContain('tech\\-lead');
  });

  it('shows warning indicator for agents above threshold', () => {
    const records = [
      makeBudget({ scope: 'global', scopeId: 'default' }),
      makeBudget({
        id: 'B002',
        scope: 'pipeline',
        scopeId: 'PL001',
        limitTokens: 100_000,
      }),
      makeBudget({
        id: 'B003',
        scope: 'agent',
        scopeId: 'PL001::tech-lead',
        limitTokens: 10_000,
        consumedTokens: 8_500,
        limitUsd: 0,
        status: 'warning',
        warningThreshold: 0.8,
      }),
    ];
    const ds = createMockDs(records);
    const text = renderDashboard(ds);
    expect(text).toContain('\u26A0');
  });

  it('shows exhausted indicator for exhausted budgets', () => {
    const records = [
      makeBudget({
        scope: 'global',
        scopeId: 'default',
        consumedTokens: 100_000,
        limitTokens: 100_000,
        status: 'exhausted',
      }),
    ];
    const ds = createMockDs(records);
    const text = renderDashboard(ds);
    expect(text).toContain('\u274C');
  });

  it('uses token display when limitUsd is 0', () => {
    const records = [
      makeBudget({
        scope: 'global',
        scopeId: 'default',
        limitUsd: 0,
        consumedUsd: 0,
        limitTokens: 50_000,
        consumedTokens: 25_000,
      }),
    ];
    const ds = createMockDs(records);
    const text = renderDashboard(ds);
    expect(text).toContain('tokens');
    expect(text).not.toContain('$');
  });

  it('filters agents to those belonging to the current pipeline', () => {
    const records = [
      makeBudget({ scope: 'global', scopeId: 'default' }),
      makeBudget({ id: 'B002', scope: 'pipeline', scopeId: 'PL001', limitTokens: 100_000 }),
      makeBudget({ id: 'B003', scope: 'agent', scopeId: 'PL001::back-1', limitTokens: 25_000, limitUsd: 0 }),
      makeBudget({ id: 'B004', scope: 'agent', scopeId: 'PL999::front-1', limitTokens: 20_000, limitUsd: 0 }),
    ];
    const ds = createMockDs(records);
    const text = renderDashboard(ds);
    expect(text).toContain('back\\-1');
    expect(text).not.toContain('front\\-1');
  });
});

/* ------------------------------------------------------------------ */
/*  handleBudgetCommand — no args (dashboard)                          */
/* ------------------------------------------------------------------ */

describe('handleBudgetCommand', () => {
  it('renders dashboard when no args provided', () => {
    const ds = createMockDs([
      makeBudget({ scope: 'global', scopeId: 'default', consumedTokens: 50_000 }),
    ]);
    const result = handleBudgetCommand('', ds, fixedNow);
    expect(result.text).toContain('Budget Dashboard');
  });

  it('renders dashboard when args is whitespace only', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('   ', ds, fixedNow);
    expect(result.text).toContain('Budget Dashboard');
  });

  it('shows usage for unknown subcommand', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('foobar', ds, fixedNow);
    expect(result.text).toContain('Usage:');
  });
});

/* ------------------------------------------------------------------ */
/*  handleBudgetCommand — replenish                                    */
/* ------------------------------------------------------------------ */

describe('handleBudgetCommand replenish', () => {
  it('replenishes global budget by token amount', () => {
    const records = [
      makeBudget({
        scope: 'global',
        scopeId: 'default',
        limitTokens: 100_000,
        consumedTokens: 90_000,
        status: 'warning',
      }),
    ];
    const ds = createMockDs(records);
    const result = handleBudgetCommand('replenish global default 50000', ds, fixedNow);
    expect(result.text).toContain('\u2705');
    expect(result.text).toContain('50,000');
    expect(ds.replenish).toHaveBeenCalledWith('B001', 50000, 0, 0, '2026-03-09T12:00:00Z');
  });

  it('returns usage when not enough args', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('replenish global', ds, fixedNow);
    expect(result.text).toContain('Usage:');
  });

  it('rejects invalid scope', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('replenish invalid default 100', ds, fixedNow);
    expect(result.text).toContain('Invalid scope');
  });

  it('rejects negative amount', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('replenish global default -100', ds, fixedNow);
    expect(result.text).toContain('Invalid amount');
  });

  it('rejects zero amount', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('replenish global default 0', ds, fixedNow);
    expect(result.text).toContain('Invalid amount');
  });

  it('rejects non-numeric amount', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('replenish global default abc', ds, fixedNow);
    expect(result.text).toContain('Invalid amount');
  });

  it('returns error when no budget record found', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('replenish pipeline PL999 10000', ds, fixedNow);
    expect(result.text).toContain('No budget record found');
  });

  it('handles replenish error gracefully', () => {
    const records = [makeBudget({ scope: 'global', scopeId: 'default' })];
    const ds = createMockDs(records);
    (ds.replenish as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('stale revision');
    });
    const result = handleBudgetCommand('replenish global default 10000', ds, fixedNow);
    expect(result.text).toContain('Replenish failed');
    expect(result.text).toContain('stale revision');
  });
});

/* ------------------------------------------------------------------ */
/*  handleBudgetCommand — reset                                        */
/* ------------------------------------------------------------------ */

describe('handleBudgetCommand reset', () => {
  it('resets agent budget consumption', () => {
    const records = [
      makeBudget({
        id: 'B003',
        scope: 'agent',
        scopeId: 'PL001::back-1',
        limitTokens: 25_000,
        consumedTokens: 20_000,
        limitUsd: 0,
        status: 'warning',
      }),
    ];
    const ds = createMockDs(records);
    const result = handleBudgetCommand('reset agent PL001::back-1', ds, fixedNow);
    expect(result.text).toContain('\u2705');
    expect(result.text).toContain('reset to zero');
    expect(ds.resetConsumption).toHaveBeenCalledWith('B003', 0, '2026-03-09T12:00:00Z');
  });

  it('returns usage when scope type is not agent', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('reset pipeline PL001', ds, fixedNow);
    expect(result.text).toContain('Usage:');
  });

  it('returns usage when not enough args', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('reset', ds, fixedNow);
    expect(result.text).toContain('Usage:');
  });

  it('returns error when no agent budget found', () => {
    const ds = createMockDs([]);
    const result = handleBudgetCommand('reset agent PL999::back-1', ds, fixedNow);
    expect(result.text).toContain('No agent budget record found');
  });

  it('handles reset error gracefully', () => {
    const records = [
      makeBudget({
        id: 'B003',
        scope: 'agent',
        scopeId: 'PL001::back-1',
        limitUsd: 0,
      }),
    ];
    const ds = createMockDs(records);
    (ds.resetConsumption as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('stale revision');
    });
    const result = handleBudgetCommand('reset agent PL001::back-1', ds, fixedNow);
    expect(result.text).toContain('Reset failed');
  });
});
