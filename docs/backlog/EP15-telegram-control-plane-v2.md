# EP15 -- Telegram Control Plane v2

> Status: IN_PROGRESS
> Dependencies: EP14
> Phase: 11 (Protocol & Communication)
> Target: April 2026

## Motivation

Telegram is the **only human interface** to the autonomous team. Three of its
seven commands return stubs. Approval workflows lack context — approving a
decision without seeing the relevant diff or quality report is guessing. The
human operator deserves a proper control surface.

**Current state (7 commands):**
- `/teamstatus` → stub: "Agent dashboard coming in Task 0042"
- `/health` → stub: "Full health endpoint in Task 0046"
- `/budget` → stub (will be implemented with EP11 task 0087)
- `/idea <text>` → creates pipeline from text (live)
- `/approve <decisionId>` → approves decision (live, minimal context)
- `/reject <decisionId> <reason>` → rejects decision (live, minimal context)
- `/decisions` → lists pending decisions (live, no detail)

**Target state:**
- All commands return real data from EP14 observability layer.
- New `/pipeline` command shows active pipeline with stage progress.
- Approval workflows show diff, quality report, and context inline.
- Proactive alerts warn before problems (timeout approaching, budget running low).

## Task Breakdown

### 11A: Dashboard Commands (parallel)

#### Task 0104: /teamstatus Live Agent Dashboard

**Scope:** Replace the stub `/teamstatus` command with a live dashboard showing
each agent's current status, task, pipeline stage, and recent activity.

**Dashboard format:**

```
🤖 Team Status
──────────────
pm        │ 🟢 Active  │ Task 0079 │ IDEA          │ 2m ago
tech-lead │ 🟡 Idle    │ --        │ --            │ 15m ago
po        │ 🟢 Active  │ Task 0079 │ STORIES       │ 5m ago
designer  │ ⚪ Skipped  │ Task 0079 │ DESIGN (skip) │ --
back-1    │ 🟢 Active  │ Task 0079 │ IMPLEMENTATION│ now
front-1   │ 🟡 Idle    │ --        │ --            │ 30m ago
qa        │ 🟡 Idle    │ --        │ --            │ 1h ago
devops    │ 🟡 Idle    │ --        │ --            │ 45m ago

Active pipelines: 1 │ Queue: 0 │ Budget: 62%
```

**Data sources:**
- Agent activity: event log (last event per agent)
- Current task/stage: pipeline state from `pipeline_status` tool
- Budget: EP11 budget engine (or event log if EP11 not yet available)

**Files to create/modify:**
- `extensions/telegram-notifier/src/commands/team-status.ts` (new)
- `extensions/telegram-notifier/src/index.ts` (modify: replace stub handler)
- Tests for formatting and data assembly

**Acceptance criteria:**
- Dashboard shows all 8 agents with correct status
- Status updates in real-time (queries current state, not cached)
- Graceful degradation if some data unavailable ("—" instead of error)
- Renders correctly in Telegram (monospaced, within message length limits)
- >= 90% test coverage

---

#### Task 0105: /health Real-Time System Diagnostics

**Scope:** Replace the stub `/health` command with real diagnostics from EP14's
`/api/metrics` endpoint.

**Dashboard format:**

```
🏥 System Health
──────────────────
Gateway:   🟢 Running (uptime: 3d 4h)
Database:  🟢 OK (12.4 MB, 342 events)
Providers:
  anthropic:    🟢 Healthy (avg 1.2s)
  openai:       🟢 Healthy (avg 0.9s)
  google-ai:    🟢 Healthy (avg 1.5s)
  copilot-proxy:🟢 Healthy (avg 2.1s)

Pipeline (7d):
  Throughput:    5 completed
  Avg duration:  45 min
  QG pass rate:  92%
  Error rate:    3%

Model Tier:  Standard (budget at 62%)
Last error:  2h ago - "Schema validation failed" (back-1)
```

**Data sources:**
- System status: `/api/metrics` endpoint (EP14 task 0100)
- Provider health: `/api/providers/health` (existing)
- Pipeline stats: aggregated metrics (EP14 task 0099)
- Last error: event log query

**Files to create/modify:**
- `extensions/telegram-notifier/src/commands/health-diagnostics.ts` (new)
- `extensions/telegram-notifier/src/index.ts` (modify: replace stub handler)
- Tests

**Acceptance criteria:**
- Health dashboard pulls from EP14 metrics endpoint
- Provider health includes latency information
- Shows last error with agent attribution
- Graceful fallback if EP14 endpoints not available
- >= 90% test coverage

---

### 11B: Pipeline & Approvals (sequential after 11A)

#### Task 0106: /pipeline Active Pipeline Visualization

**Scope:** Add a new `/pipeline` Telegram command that shows the current pipeline
execution status with stage progression.

**Visualization format:**

```
🔄 Pipeline: Task 0079
──────────────────────
✅ IDEA        │ pm        │ 3m   │ $0.05
✅ ROADMAP     │ pm        │ 5m   │ $0.08
✅ STORIES     │ po        │ 4m   │ $0.06
✅ DECOMP      │ tech-lead │ 8m   │ $0.25
⏭️ DESIGN      │ skip      │ --   │ --
▶️ IMPLEMENT   │ back-1    │ 12m… │ $0.42
⬜ QA          │ qa        │ --   │ --
⬜ REVIEW      │ tech-lead │ --   │ --
⬜ PR          │ devops    │ --   │ --
⬜ DONE        │ --        │ --   │ --

Elapsed: 32m │ Est. remaining: 25m │ Budget: $2.14 / $5.00
```

**Commands:**
- `/pipeline` — show most recent active pipeline
- `/pipeline <taskId>` — show specific pipeline
- `/pipeline history` — list last 5 completed pipelines with summary

**Data source:** `/api/timeline/:pipelineId` endpoint (EP14 task 0101)

**Files to create/modify:**
- `extensions/telegram-notifier/src/commands/pipeline-view.ts` (new)
- `extensions/telegram-notifier/src/index.ts` (modify: register command)
- Tests

**Acceptance criteria:**
- Visual pipeline shows all 10 stages with Unicode icons
- Current stage animated with elapsed time
- Skipped stages clearly marked
- Cost per stage displayed
- History command shows last 5 pipelines
- >= 90% test coverage

---

#### Task 0107: Rich Approval Workflows with Inline Context

**Scope:** Enhance the `/approve` and `/reject` commands to show full context
before the human makes a decision.

**Current flow:**
```
Bot: "Decision pending: tech_choice for task 0079. /approve dec-001 or /reject dec-001 <reason>"
Human: /approve dec-001
```

**Enhanced flow:**
```
Bot: "🔵 Decision Required: tech_choice
─────────────────────────
Task: 0079 - Implement complexity scorer
Agent: tech-lead
Stage: DECOMPOSITION

Question: Should we use ts-morph AST analysis or regex heuristics for complexity scoring?

Option A (auto-recommended): ts-morph AST
  - Higher accuracy
  - Already used in quality_complexity tool
  - Slower but acceptable for routing decisions

Option B: Regex heuristics
  - Faster execution
  - Less accurate
  - Already used in qgate_complexity tool

Quality context:
  - Current coverage: 87%
  - Lint: 0 errors
  - Budget remaining: $3.40 / $5.00

/approve dec-001    → Accept ts-morph AST (recommended)
/reject dec-001 B   → Choose regex heuristics
/reject dec-001 <custom reason>"
```

**Context enrichment sources:**
- Task details from task record
- Pipeline stage from pipeline state
- Quality metrics from last quality gate run
- Budget from budget engine
- Decision options from decision engine

**Files to create/modify:**
- `extensions/telegram-notifier/src/commands/decision-approval.ts` (new/rewrite)
- `extensions/telegram-notifier/src/formatters/decision-context.ts` (new)
- Tests

**Acceptance criteria:**
- Decision notification includes full task context
- Quality metrics shown inline
- Budget status shown inline
- Multiple rejection options supported (not just free-text)
- Recommended option clearly marked
- >= 90% test coverage

---

### 11C: Proactive Alerting (sequential after 11B)

#### Task 0108: Proactive Alerting Engine

**Scope:** Build an alerting engine that monitors system state and proactively
sends Telegram notifications before problems occur.

**Alert types:**

| Alert | Trigger | Severity | Cooldown |
|-------|---------|----------|----------|
| `STAGE_TIMEOUT_WARNING` | Stage duration > 80% of timeout | WARNING | 5m |
| `BUDGET_WARNING` | Budget consumption > warning threshold | WARNING | 10m |
| `BUDGET_FORECAST_OVERSPEND` | Forecast predicts overspend | CRITICAL | 15m |
| `AGENT_ERROR_SPIKE` | Agent error rate > 3x baseline | WARNING | 10m |
| `PROVIDER_DEGRADED` | Provider latency > 3x baseline | WARNING | 5m |
| `PROVIDER_DOWN` | Provider health check failed | CRITICAL | 1m |
| `PIPELINE_STALLED` | No stage transition for > 15m | CRITICAL | 15m |
| `SPAWN_FAILURE` | Agent spawn failed and entered DLQ | CRITICAL | 1m |
| `QUALITY_GATE_REGRESSION` | QG pass rate dropped > 20% vs 7d avg | WARNING | 1h |

**Alert format:**

```
⚠️ STAGE_TIMEOUT_WARNING
──────────────
Pipeline: Task 0079
Stage: IMPLEMENTATION (back-1)
Duration: 18m / 20m timeout (90%)

Action: Stage will be escalated in 2 minutes.
/pipeline 0079 for details
```

**Deduplication:**
- Each alert type + scope has a cooldown period
- Same alert not re-sent within cooldown window
- Cooldown state stored in memory (lost on restart — acceptable)

**Files to create/modify:**
- `extensions/telegram-notifier/src/alerting/alert-engine.ts` (new)
- `extensions/telegram-notifier/src/alerting/alert-rules.ts` (new)
- `extensions/telegram-notifier/src/alerting/alert-cooldown.ts` (new)
- `extensions/telegram-notifier/src/index.ts` (modify: start alert engine on load)
- Tests for all new files

**Acceptance criteria:**
- All 9 alert types implemented with correct trigger conditions
- Cooldown prevents alert spam
- Alerts include actionable context (what to do next, relevant command)
- Alert severity clearly indicated (⚠️ WARNING, 🔴 CRITICAL)
- Alert engine can be disabled via config (`alerting.enabled: false`)
- >= 90% test coverage

## Definition of Done

- [ ] All 5 tasks completed with >= 90% test coverage each
- [ ] `/teamstatus` shows live agent status with current task and stage
- [ ] `/health` shows real-time system diagnostics from metrics
- [ ] `/pipeline` shows visual pipeline progress with costs
- [ ] Approval workflows include full context (task, quality, budget)
- [ ] Proactive alerts fire before problems with actionable recommendations
- [ ] Zero stub command responses remaining
- [ ] `pnpm test && pnpm lint && pnpm typecheck` passes
