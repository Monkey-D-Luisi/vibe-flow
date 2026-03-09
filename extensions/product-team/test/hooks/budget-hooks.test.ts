import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerBudgetHooks, type BudgetStatePublisher } from '../../src/hooks/budget-hooks.js';
import type { AgentBudgetTrackerDeps } from '../../src/orchestrator/agent-budget-tracker.js';

/* ------------------------------------------------------------------ */
/*  Mock modules                                                       */
/* ------------------------------------------------------------------ */

vi.mock('../../src/orchestrator/agent-budget-tracker.js', () => ({
  extractTokenUsage: vi.fn(),
  trackAgentConsumption: vi.fn(),
  ensureAgentBudgets: vi.fn(),
  checkAgentBudget: vi.fn(),
}));

import {
  extractTokenUsage,
  trackAgentConsumption,
  ensureAgentBudgets,
  checkAgentBudget,
} from '../../src/orchestrator/agent-budget-tracker.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type HookHandler = (...args: unknown[]) => unknown;

function createMockApi() {
  const hooks: Record<string, HookHandler[]> = {};
  return {
    on: vi.fn((event: string, handler: HookHandler) => {
      if (!hooks[event]) hooks[event] = [];
      hooks[event].push(handler);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    _hooks: hooks,
    _fire(event: string, ...args: unknown[]) {
      for (const h of hooks[event] ?? []) h(...args);
    },
  };
}

function createMockDeps(): AgentBudgetTrackerDeps {
  return {
    budgetRepo: {} as AgentBudgetTrackerDeps['budgetRepo'],
    budgetGuardDeps: {} as AgentBudgetTrackerDeps['budgetGuardDeps'],
    pricingTable: {} as AgentBudgetTrackerDeps['pricingTable'],
    generateId: () => 'gen-id',
    now: () => '2026-03-09T12:00:00Z',
    allocations: { 'back-1': 25, 'front-1': 20 },
  };
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  BudgetStatePublisher callback (Task 0086)                          */
/* ------------------------------------------------------------------ */

describe('BudgetStatePublisher callback', () => {
  it('calls publisher after successful tracking with budget state', () => {
    const api = createMockApi();
    const deps = createMockDeps();
    const publisher = vi.fn() as unknown as BudgetStatePublisher;

    vi.mocked(extractTokenUsage).mockReturnValue({
      inputTokens: 100,
      outputTokens: 50,
      provider: 'openai',
      model: 'gpt-4o',
    });
    vi.mocked(checkAgentBudget).mockReturnValue({
      allowed: true,
      scope: 'agent' as const,
      scopeId: 'back-1',
      remainingTokens: 5000,
      consumedTokens: 3000,
      limitTokens: 8000,
      consumptionRatio: 0.375,
      status: 'active' as const,
    });

    registerBudgetHooks(api as never, deps, ['back-1', 'front-1'], publisher as BudgetStatePublisher);

    // Simulate after_tool_call with valid taskId
    api._fire('after_tool_call', {
      toolName: 'some_tool',
      result: { taskId: 'TASK-001', pipelineId: 'pipe-1' },
    }, { agentId: 'back-1' });

    expect(publisher).toHaveBeenCalledOnce();
    expect(publisher).toHaveBeenCalledWith({
      agentId: 'back-1',
      consumptionRatio: 0.375,
      status: 'active',
      updatedAt: '2026-03-09T12:00:00Z',
    });
  });

  it('does not call publisher when no publisher is provided', () => {
    const api = createMockApi();
    const deps = createMockDeps();

    vi.mocked(extractTokenUsage).mockReturnValue({
      inputTokens: 100,
      outputTokens: 50,
      provider: 'openai',
      model: 'gpt-4o',
    });

    registerBudgetHooks(api as never, deps, ['back-1']);

    api._fire('after_tool_call', {
      toolName: 'some_tool',
      result: { taskId: 'TASK-001', pipelineId: 'pipe-1' },
    }, { agentId: 'back-1' });

    // trackAgentConsumption should still be called
    expect(trackAgentConsumption).toHaveBeenCalledOnce();
    // No publisher to call -- no error
  });

  it('logs warning when publisher throws and does not bubble error', () => {
    const api = createMockApi();
    const deps = createMockDeps();
    const publisher = vi.fn().mockImplementation(() => {
      throw new Error('publish failed');
    }) as unknown as BudgetStatePublisher;

    vi.mocked(extractTokenUsage).mockReturnValue({
      inputTokens: 100,
      outputTokens: 50,
      provider: 'openai',
      model: 'gpt-4o',
    });
    vi.mocked(checkAgentBudget).mockReturnValue({
      allowed: true,
      scope: 'agent' as const,
      scopeId: 'back-1',
      remainingTokens: 5000,
      consumedTokens: 3000,
      limitTokens: 8000,
      consumptionRatio: 0.375,
      status: 'active' as const,
    });

    registerBudgetHooks(api as never, deps, ['back-1'], publisher as BudgetStatePublisher);

    // Should not throw
    api._fire('after_tool_call', {
      toolName: 'some_tool',
      result: { taskId: 'TASK-001', pipelineId: 'pipe-1' },
    }, { agentId: 'back-1' });

    // trackAgentConsumption should still succeed
    expect(trackAgentConsumption).toHaveBeenCalledOnce();
    // Warning should be logged
    expect(api.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('agent-budget-publish'),
    );
  });

  it('does not call publisher when extractTokenUsage returns null', () => {
    const api = createMockApi();
    const deps = createMockDeps();
    const publisher = vi.fn() as unknown as BudgetStatePublisher;

    vi.mocked(extractTokenUsage).mockReturnValue(null as never);

    registerBudgetHooks(api as never, deps, ['back-1'], publisher as BudgetStatePublisher);

    api._fire('after_tool_call', {
      toolName: 'some_tool',
      result: { taskId: 'TASK-001' },
    }, { agentId: 'back-1' });

    expect(publisher).not.toHaveBeenCalled();
  });

  it('does not call publisher when no taskId (tracking skipped)', () => {
    const api = createMockApi();
    const deps = createMockDeps();
    const publisher = vi.fn() as unknown as BudgetStatePublisher;

    vi.mocked(extractTokenUsage).mockReturnValue({
      inputTokens: 100,
      outputTokens: 50,
      provider: 'openai',
      model: 'gpt-4o',
    });

    registerBudgetHooks(api as never, deps, ['back-1'], publisher as BudgetStatePublisher);

    api._fire('after_tool_call', {
      toolName: 'some_tool',
      result: {},  // no taskId
    }, { agentId: 'back-1' });

    expect(trackAgentConsumption).not.toHaveBeenCalled();
    expect(publisher).not.toHaveBeenCalled();
  });

  it('passes pipelineId to checkAgentBudget when available', () => {
    const api = createMockApi();
    const deps = createMockDeps();
    const publisher = vi.fn() as unknown as BudgetStatePublisher;

    vi.mocked(extractTokenUsage).mockReturnValue({
      inputTokens: 100,
      outputTokens: 50,
      provider: 'openai',
      model: 'gpt-4o',
    });
    vi.mocked(checkAgentBudget).mockReturnValue({
      allowed: true,
      scope: 'agent' as const,
      scopeId: 'pipe-1::back-1',
      remainingTokens: 5000,
      consumedTokens: 3000,
      limitTokens: 8000,
      consumptionRatio: 0.375,
      status: 'warning' as const,
    });

    registerBudgetHooks(api as never, deps, ['back-1'], publisher as BudgetStatePublisher);

    api._fire('after_tool_call', {
      toolName: 'some_tool',
      result: { taskId: 'TASK-001', pipelineId: 'pipe-1' },
    }, { agentId: 'back-1' });

    expect(checkAgentBudget).toHaveBeenCalledWith(deps, 'back-1', 'pipe-1');
    expect(publisher).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'warning' }),
    );
  });
});
