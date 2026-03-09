# EP11 -- Budget Intelligence

> Status: DONE
> Dependencies: EP09
> Phase: 10 (Adaptive Intelligence)
> Target: March 2026

## Motivation

Budget tracking exists but is advisory-only. The event log captures token costs per
stage (EP09 task 0072), and per-task budget limits were introduced in EP06, but they
are soft warnings that do not halt execution. The Telegram `/budget` command returns
a placeholder. With limited LLM tokens, a pipeline that overruns its budget with no
enforcement is a real operational risk.

**Current state:**
- Per-stage token cost in event log (live, EP09)
- Per-task budget config in plugin schema (live, EP06)
- Budget warnings in structured logs (live)
- `/budget` Telegram command (stub: returns "Budget tracking coming in Task 0046")
- No hard limits, no per-agent tracking, no forecasting

**Target state:**
- Hard budget limits that halt pipeline stages before overspend.
- Per-agent budget allocation and tracking.
- Automatic model tier downgrade when budget crosses threshold (integrates with EP10).
- Real-time budget dashboard accessible via Telegram `/budget`.
- Proactive alerts when budget consumption trends toward exhaustion.

## Task Breakdown

### 10A: Budget Engine (parallel with EP10 scoring)

#### Task 0084: Hard Budget Limits Engine

**Scope:** Replace advisory budget warnings with enforced hard limits that block
LLM requests when budget is exhausted.

**Budget hierarchy:**

```
Global budget (per gateway instance)
  └─ Pipeline budget (per pipeline run)
       └─ Stage budget (per pipeline stage)
            └─ Agent budget (per agent per pipeline)
```

**Enforcement points:**
1. `before_model_resolve` hook (EP10): check remaining budget before routing
2. `pipeline_advance` tool: check stage budget before advancing
3. `workflow_step_run` tool: check agent budget before running LLM step

**Budget exhaustion behavior:**
- Stage budget exhausted → escalate to human via Telegram, pause pipeline stage
- Pipeline budget exhausted → halt pipeline, notify human, log structured event
- Global budget exhausted → reject all new pipeline starts, notify human
- Agent budget exhausted → agent cannot make LLM calls, can still use non-LLM tools

**Budget replenishment:**
- Manual via Telegram command: `/budget replenish <scope> <amount>`
- Automatic daily reset (configurable, default: no auto-reset)

**Data model:**

```typescript
interface BudgetRecord {
  id: string;
  scope: 'global' | 'pipeline' | 'stage' | 'agent';
  scopeId: string;           // pipeline ID, stage name, or agent ID
  limitTokens: number;       // configured limit
  consumedTokens: number;    // running total
  limitUsd: number;          // optional USD limit
  consumedUsd: number;       // running total
  status: 'active' | 'warning' | 'exhausted';
  warningThreshold: number;  // percentage (default 80)
  createdAt: string;
  updatedAt: string;
}
```

**Files to create/modify:**
- `extensions/product-team/src/domain/budget.ts` (new: domain model)
- `extensions/product-team/src/persistence/budget-repo.ts` (new: SQLite persistence)
- `extensions/product-team/src/persistence/migrations/` (add budget table migration)
- `extensions/product-team/src/orchestrator/budget-guard.ts` (new: enforcement logic)
- Tests for all new files

**Acceptance criteria:**
- Budget table created via migration (no manual schema changes)
- Hard limit enforcement blocks LLM requests when exhausted
- Budget status transitions: active → warning (at threshold) → exhausted (at limit)
- Structured event emitted on every status transition
- >= 90% test coverage

---

#### Task 0085: Per-Agent Budget Tracking and Enforcement

**Scope:** Track token consumption per agent per pipeline run and enforce
per-agent budget allocations.

**Token tracking integration:**
- Hook into `after_tool_call` event (already used by Telegram plugin)
- Extract token usage from LLM response metadata
- Credit consumption to the calling agent's budget record
- Support both token-based and USD-based tracking (using provider pricing tables)

**Provider pricing table (configurable):**

| Provider | Model | Input (per 1K tokens) | Output (per 1K tokens) |
|----------|-------|-----------------------|------------------------|
| anthropic | claude-opus-4.6 | $0.015 | $0.075 |
| anthropic | claude-sonnet-4.6 | $0.003 | $0.015 |
| openai | gpt-5.3 | $0.010 | $0.030 |
| openai | gpt-4.1 | $0.002 | $0.008 |
| github | copilot-proxy | $0.000 | $0.000 |

**Default budget allocation (percentage of pipeline budget):**

| Agent | Default Share | Rationale |
|-------|---------------|-----------|
| pm | 5% | Mostly coordinates, low token usage |
| po | 10% | Brief writing, acceptance criteria |
| tech-lead | 15% | Architecture decisions, code review |
| designer | 5% | Stitch MCP calls, minimal LLM usage |
| back-1 | 25% | Heavy code generation |
| front-1 | 20% | Code generation, styling |
| qa | 10% | Test generation, report writing |
| devops | 10% | CI/CD, deployment scripts |

**Files to create/modify:**
- `extensions/product-team/src/orchestrator/agent-budget-tracker.ts` (new)
- `extensions/product-team/src/domain/pricing-table.ts` (new)
- `extensions/product-team/src/index.ts` (modify: add `after_tool_call` hook for tracking)
- Tests for all new files

**Acceptance criteria:**
- Token consumption tracked per agent per pipeline
- USD cost calculated using configurable pricing table
- Agent budget enforcement blocks agent LLM calls when exhausted
- Budget allocation percentages configurable in plugin config
- >= 90% test coverage

---

### 10B: Integration (sequential after 10A)

#### Task 0086: Budget-Triggered Model Tier Auto-Downgrade

**Scope:** Connect the budget engine (tasks 0084-0085) with the model router
(EP10) so that budget consumption automatically triggers model tier downgrades.

**Integration flow:**

```
1. Agent makes LLM request
2. before_model_resolve hook fires (EP10)
3. Model resolver queries budget engine for remaining budget
4. If budget < warningThreshold → downgrade to Standard tier
5. If budget < criticalThreshold → downgrade to Economy tier
6. If budget exhausted → block request, escalate
7. Resolution logged with budget context
```

**Configuration:**

```json
{
  "budget": {
    "warningThreshold": 0.5,
    "criticalThreshold": 0.2,
    "downgradePolicy": "automatic",
    "highComplexityOverride": true
  }
}
```

**Files to create/modify:**
- `extensions/model-router/src/budget-integration.ts` (new)
- `extensions/model-router/src/model-resolver.ts` (modify: add budget query)
- Tests for all new files

**Acceptance criteria:**
- Model tier adjusts in real-time based on budget consumption
- High-complexity tasks resist downgrade (configurable override)
- Budget query adds < 5ms to resolution time (in-memory cache)
- >= 90% test coverage

---

#### Task 0087: Telegram /budget Real-Time Dashboard

**Scope:** Replace the stub `/budget` Telegram command with a real-time dashboard
showing budget consumption across global, pipeline, and agent scopes.

**Dashboard format:**

```
📊 Budget Dashboard
───────────────────
Global:    ████████░░ 78% ($3.12 / $4.00)
Pipeline:  ██████░░░░ 62% ($1.24 / $2.00)

Per-Agent (current pipeline):
  pm:       ██░░░░░░░░ 15% ($0.03 / $0.10)
  tech-lead: ████████░░ 82% ($0.25 / $0.30) ⚠️
  back-1:   ██████░░░░ 58% ($0.35 / $0.50)
  front-1:  █████░░░░░ 45% ($0.18 / $0.40)
  qa:       ███░░░░░░░ 28% ($0.06 / $0.20)
  ...

Model Tier: Standard (downgraded from Premium)
Next reset: Manual (no auto-reset configured)
```

**Commands:**
- `/budget` — show dashboard
- `/budget replenish global <amount>` — add to global budget
- `/budget replenish pipeline <id> <amount>` — add to pipeline budget
- `/budget reset agent <agentId>` — reset agent budget for current pipeline

**Files to create/modify:**
- `extensions/telegram-notifier/src/commands/budget-dashboard.ts` (new)
- `extensions/telegram-notifier/src/index.ts` (modify: replace stub handler)
- Tests for new module

**Acceptance criteria:**
- Dashboard renders correctly with real budget data
- Progress bars use Unicode block characters
- Warning emoji (⚠️) shown for agents above warning threshold
- Replenish/reset commands validate permissions
- >= 90% test coverage

---

### 10C: Forecasting (sequential after 10B)

#### Task 0088: Budget Forecasting and Overspend Alerting

**Scope:** Add predictive budget forecasting that alerts when the current
consumption rate will exhaust the budget before pipeline completion.

**Forecasting algorithm:**

```
1. Calculate burn rate: consumed_tokens / elapsed_time_in_pipeline
2. Estimate remaining work: count remaining pipeline stages × avg_tokens_per_stage
3. Forecast: will remaining budget cover estimated remaining work?
4. If forecast < 0 (projected overspend):
   a. Calculate projected overspend amount
   b. Suggest model tier downgrade that would bring forecast positive
   c. Alert via Telegram with recommendation
```

**Proactive alerts (sent to Telegram):**
- `BUDGET_WARNING`: consumption crosses warning threshold
- `BUDGET_FORECAST_OVERSPEND`: projected to exceed limit
- `BUDGET_EXHAUSTED`: limit reached, pipeline paused
- `BUDGET_REPLENISHED`: manual replenishment received

**Files to create/modify:**
- `extensions/product-team/src/orchestrator/budget-forecast.ts` (new)
- `extensions/telegram-notifier/src/handlers/budget-alerts.ts` (new)
- Tests for all new files

**Acceptance criteria:**
- Forecast recalculated after each stage completion
- Alert includes actionable recommendation (e.g., "downgrade to Economy tier")
- No false-positive alerts (only alert if confident >= 80% of overspend)
- >= 90% test coverage including edge cases (first stage, single-stage pipeline)

## Definition of Done

- [ ] All 5 tasks completed with >= 90% test coverage each
- [ ] Hard budget limits actively halt execution on exhaustion
- [ ] Per-agent tracking credits costs to correct agent
- [ ] Model tier auto-downgrade activates at configured thresholds
- [ ] `/budget` Telegram command shows real-time dashboard
- [ ] Forecasting alerts fire before budget exhaustion
- [ ] `pnpm test && pnpm lint && pnpm typecheck` passes
- [ ] Integration test: pipeline pauses on budget exhaustion and resumes after replenishment
