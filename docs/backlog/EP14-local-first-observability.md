# EP14 -- Local-First Observability

> Status: IN_PROGRESS
> Dependencies: EP09
> Phase: 11 (Protocol & Communication)
> Target: April 2026

## Motivation

The event log captures everything — stage transitions, decisions, token costs,
quality gate results. But there is no aggregation layer, no query API, and no
way to answer "what happened?" without writing SQL against the SQLite database.
The `/health` Telegram command returns a stub.

This epic builds observability that runs entirely on local infrastructure:
SQLite for storage, HTTP endpoints for querying, Telegram for visualization.
No Prometheus, no Grafana, no external services.

**Current state:**
- Event log: append-only SQLite table with structured JSON events (live)
- Per-stage metrics: duration, token cost, retry count (live, EP09)
- Structured logging with correlation IDs (partial, EP05)
- `/health` Telegram command (stub)
- No aggregation, no dashboards, no query endpoints

**Target state:**
- Aggregated metrics computed from event log (materialized views or computed tables).
- HTTP endpoints exposing system health and pipeline timeline.
- Structured logging with guaranteed correlation IDs on every log line.
- Agent activity heatmap showing who did what, when, for how long.

## Task Breakdown

### 11A: Metrics Engine (parallel)

#### Task 0099: Metrics Aggregation Engine (SQLite)

**Scope:** Build an aggregation layer over the event log that computes and caches
key metrics in SQLite, making them queryable in milliseconds instead of requiring
full table scans.

**Aggregated metrics:**

| Metric | Granularity | Source Events |
|--------|-------------|---------------|
| Pipeline throughput | Daily/weekly | `pipeline_complete` events |
| Stage avg duration | Per stage | `stage_transition` events |
| Agent token consumption | Per agent, daily | `tool_call` events with token metadata |
| Quality gate pass rate | Per gate type | `quality_gate_result` events |
| Decision auto-resolve rate | Per category | `decision_*` events |
| Error rate | Per agent, daily | `error` events |
| Spawn success rate | Per agent | `spawn_*` events |

**Implementation:**

```sql
-- Materialized metrics table
CREATE TABLE IF NOT EXISTS metrics_aggregated (
  metric_name TEXT NOT NULL,
  dimension TEXT NOT NULL,      -- e.g., 'agent:back-1', 'stage:IMPLEMENTATION'
  period TEXT NOT NULL,          -- 'daily:2026-03-08', 'weekly:2026-W10'
  value REAL NOT NULL,
  sample_count INTEGER NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (metric_name, dimension, period)
);
```

**Aggregation schedule:**
- After every pipeline completion
- On-demand via new tool `metrics_refresh`
- Incremental: only process events since last aggregation

**Files to create/modify:**
- `extensions/product-team/src/observability/metrics-engine.ts` (new)
- `extensions/product-team/src/persistence/metrics-repo.ts` (new)
- `extensions/product-team/src/persistence/migrations/` (add metrics table)
- `extensions/product-team/src/tools/metrics-refresh.ts` (new: tool registration)
- Tests for all new files

**Acceptance criteria:**
- Aggregation completes in < 1s for 1000 events
- Incremental aggregation only processes new events
- All 7 metric types computed and stored
- `metrics_refresh` tool registered and documented
- >= 90% test coverage

---

#### Task 0100: /api/metrics System Health Endpoint

**Scope:** Expose a read-only HTTP endpoint that returns a JSON summary of system
health, drawing from the aggregated metrics (task 0099).

**Endpoint:** `GET /api/metrics`

**Response schema:**

```json
{
  "timestamp": "2026-03-08T14:30:00Z",
  "system": {
    "status": "healthy",
    "uptime_seconds": 86400,
    "active_pipelines": 1,
    "queued_pipelines": 0
  },
  "agents": {
    "back-1": {
      "status": "active",
      "current_task": "0079",
      "current_stage": "IMPLEMENTATION",
      "tokens_today": 15234,
      "tasks_completed_today": 2,
      "error_rate_7d": 0.05
    }
  },
  "pipelines": {
    "throughput_7d": 5,
    "avg_duration_minutes": 45,
    "quality_gate_pass_rate": 0.92
  },
  "budget": {
    "global_consumed": 3.12,
    "global_limit": 10.00,
    "global_remaining_pct": 0.688
  },
  "stages": {
    "IMPLEMENTATION": { "avg_duration_minutes": 12, "retry_rate": 0.1 },
    "CODE_REVIEW": { "avg_duration_minutes": 5, "retry_rate": 0.05 }
  }
}
```

**Files to create/modify:**
- `extensions/product-team/src/observability/health-endpoint.ts` (new)
- `extensions/product-team/src/index.ts` (modify: register HTTP route)
- Tests for endpoint

**Acceptance criteria:**
- Endpoint returns valid JSON matching schema above
- Response time < 100ms (reads from aggregated metrics, not raw events)
- Returns `503 Service Unavailable` if metrics not yet computed
- >= 90% test coverage

---

### 11B: Timeline & Logging (sequential after 11A)

#### Task 0101: /api/timeline Pipeline Execution Endpoint

**Scope:** Expose an HTTP endpoint that returns the execution timeline of a
specific pipeline run, showing each stage with timestamps, durations, agents,
decisions, and quality gate outcomes.

**Endpoint:** `GET /api/timeline/:pipelineId`

**Response schema:**

```json
{
  "pipelineId": "pipe-001",
  "taskId": "0077",
  "status": "completed",
  "startedAt": "2026-03-07T10:00:00Z",
  "completedAt": "2026-03-07T11:30:00Z",
  "totalDuration_minutes": 90,
  "totalTokens": 45000,
  "totalCost_usd": 1.85,
  "stages": [
    {
      "name": "IDEA",
      "agent": "pm",
      "model": "openai/gpt-5.3",
      "status": "completed",
      "startedAt": "2026-03-07T10:00:00Z",
      "duration_minutes": 3,
      "tokens": 2500,
      "cost_usd": 0.05,
      "retries": 0,
      "qualityGate": null,
      "decisions": []
    },
    {
      "name": "IMPLEMENTATION",
      "agent": "back-1",
      "model": "anthropic/claude-sonnet-4.6",
      "status": "completed",
      "startedAt": "2026-03-07T10:25:00Z",
      "duration_minutes": 25,
      "tokens": 18000,
      "cost_usd": 0.72,
      "retries": 1,
      "qualityGate": { "coverage": 85, "lint": 0, "complexity": 3.2, "passed": true },
      "decisions": [
        { "id": "dec-001", "category": "tech_choice", "resolution": "auto", "outcome": "success" }
      ]
    }
  ]
}
```

**Files to create/modify:**
- `extensions/product-team/src/observability/timeline-endpoint.ts` (new)
- `extensions/product-team/src/index.ts` (modify: register HTTP route)
- Tests for endpoint

**Acceptance criteria:**
- Timeline includes all pipeline stages with complete metadata
- Decisions and quality gates embedded per-stage
- Response time < 200ms for pipelines with up to 10 stages
- Returns 404 for unknown pipeline IDs
- >= 90% test coverage

---

#### Task 0102: Structured Logging Consolidation

**Scope:** Audit all log statements across all extensions and ensure every log
line includes a correlation ID, agent ID, and structured context.

**Current gaps (from EP05 observations):**
- Some log lines use `logger.info(string)` without structured fields
- Correlation IDs are present in some paths but not all
- Model-router and quality-gate extensions log without correlation context
- Telegram plugin logs without agent context

**Target format:**

```json
{
  "timestamp": "2026-03-08T14:30:00.123Z",
  "level": "info",
  "message": "Stage transition completed",
  "correlationId": "corr-abc-123",
  "agentId": "back-1",
  "taskId": "0079",
  "pipelineId": "pipe-001",
  "extension": "product-team",
  "module": "pipeline-advance",
  "data": { "fromStage": "IMPLEMENTATION", "toStage": "QA" }
}
```

**Files to modify:** Audit and update log statements in:
- `extensions/product-team/src/**/*.ts`
- `extensions/model-router/src/**/*.ts`
- `extensions/quality-gate/src/**/*.ts`
- `extensions/telegram-notifier/src/**/*.ts`
- `extensions/stitch-bridge/src/**/*.ts`

**Acceptance criteria:**
- Every `logger.*()` call includes `correlationId` (or explicit `correlationId: 'none'` for startup)
- Structured JSON format for all log lines (no bare string logging)
- Grep for `logger.info(` / `logger.warn(` / `logger.error(` finds zero bare-string calls
- >= 90% test coverage for logging utility

---

### 11C: Visualization (sequential after 11B)

#### Task 0103: Agent Activity Heatmap

**Scope:** Build a queryable representation of agent activity over time, answering
"who did what, when, and for how long?" Exposed via `/api/metrics/heatmap` and
consumable by Telegram commands.

**Heatmap data model:**

```typescript
interface HeatmapEntry {
  agentId: string;
  hour: string;          // ISO 8601 hour: '2026-03-08T14'
  activeMinutes: number; // minutes spent on LLM calls
  idleMinutes: number;   // minutes between calls
  tokenCount: number;
  taskCount: number;
  errorCount: number;
}
```

**Endpoint:** `GET /api/metrics/heatmap?from=2026-03-07&to=2026-03-08`

**Files to create/modify:**
- `extensions/product-team/src/observability/heatmap.ts` (new)
- `extensions/product-team/src/index.ts` (modify: register HTTP route)
- Tests for heatmap computation and endpoint

**Acceptance criteria:**
- Heatmap computed from event log (active = time between tool_call start/end)
- Filterable by date range and agent ID
- Response time < 200ms for 24-hour window
- >= 90% test coverage

## Definition of Done

- [ ] All 5 tasks completed with >= 90% test coverage each
- [ ] Aggregated metrics refresh automatically after pipeline completion
- [ ] `/api/metrics` returns comprehensive system health JSON
- [ ] `/api/timeline/:id` returns full pipeline execution history
- [ ] All log statements structured with correlation IDs
- [ ] Agent activity heatmap queryable via HTTP
- [ ] `pnpm test && pnpm lint && pnpm typecheck` passes
