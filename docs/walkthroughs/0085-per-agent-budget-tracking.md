# Walkthrough: 0085 -- Per-Agent Budget Tracking and Enforcement

## Task Reference

- Task: `docs/tasks/0085-per-agent-budget-tracking.md`
- Epic: EP11 -- Budget Intelligence
- Branch: `feat/0085-per-agent-budget-tracking`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/249

---

## Summary

Wired the Task 0084 budget infrastructure into the plugin lifecycle by creating a pricing table for USD cost calculation, an agent budget tracker for per-agent consumption recording, and an `after_tool_call` hook in `index.ts` that records token usage against agent-scope budget records.

---

## Context

Task 0084 built the hard budget limits engine as standalone library code: domain model (`BudgetRecord`), repository (`SqliteBudgetRepository`), guard functions (`checkBudget`, `enforceBudget`, `recordConsumption`), and the `budget_records` table (migration 005). However, none of this was wired into the plugin lifecycle. This task creates the pricing table, agent budget tracker, and hooks to make budget tracking active.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Fail-open for unknown models (0 USD cost) | Unknown models should not block execution; they just aren't tracked for cost |
| Composite scope ID `pipelineId::agentId` | Enables per-agent-per-pipeline tracking while reusing the existing `budget_records` unique index on (scope, scope_id) |
| Agent allocations from pipeline budget | Natural hierarchy: pipeline budget is the parent, agent budgets are derived as percentages |
| PricingTable as constructor-injected class | Enables testing with custom pricing and runtime config overrides |

---

## Implementation Notes

### Approach

1. Created `pricing-table.ts` as a pure domain module with default pricing data and config parsers
2. Created `agent-budget-tracker.ts` as an orchestrator module that bridges the budget guard with agent lifecycle
3. Wired `SqliteBudgetRepository`, `PricingTable`, and budget guard deps into `index.ts`
4. Added an `after_tool_call` hook that extracts token usage from event results and records consumption

### Key Changes

- **PricingTable**: Maps (provider, model) to per-1K-token rates. Supports custom overrides. Copilot-proxy is free.
- **AgentBudgetTracker**: `ensureAgentBudgets()` creates agent-scope records from pipeline budget allocations. `trackAgentConsumption()` records usage. `checkAgentBudget()` checks remaining budget.
- **index.ts**: Instantiates `SqliteBudgetRepository`, `PricingTable`, and registers the `after_tool_call` hook (489 LOC, under 500 limit).

---

## Commands Run

```bash
pnpm typecheck  # all packages pass
pnpm test       # 995 tests pass (98 files)
pnpm lint       # zero errors
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/domain/pricing-table.ts` | Created | Provider pricing table with default rates and config parsers |
| `extensions/product-team/src/orchestrator/agent-budget-tracker.ts` | Created | Agent budget tracking: ensure budgets, track consumption, check budget |
| `extensions/product-team/src/index.ts` | Modified | Wire budget repo, pricing table, and after_tool_call tracking hook |
| `extensions/product-team/test/domain/pricing-table.test.ts` | Created | 22 tests for pricing table, allocations, and config parsers |
| `extensions/product-team/test/orchestrator/agent-budget-tracker.test.ts` | Created | 18 tests for agent budget tracker |
| `docs/tasks/0085-per-agent-budget-tracking.md` | Created | Task spec |
| `docs/walkthroughs/0085-per-agent-budget-tracking.md` | Created | This walkthrough |
| `docs/roadmap.md` | Modified | Status update |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| pricing-table | 22 | 22 | ~95% |
| agent-budget-tracker | 18 | 18 | ~92% |
| Total new | 40 | 40 | >= 90% |

---

## Follow-ups

- Task 0086: Budget-Triggered Model Tier Auto-Downgrade (connect budget engine with model router)
- Task 0087: Telegram /budget Real-Time Dashboard (replace stub with real data)
- `before_tool_call` budget enforcement hook (blocks calls before execution, currently only tracks after)

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
