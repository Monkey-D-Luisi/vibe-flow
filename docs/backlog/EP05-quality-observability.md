# EP05 -- Quality & Observability

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| Epic        | EP05                                             |
| Status      | DONE                                             |
| Priority    | P2                                               |
| Phase       | 4 -- Quality & Observability                     |
| Target      | July 2026                                        |
| Depends on  | EP02, EP03                                       |
| Blocks      | None                                             |

## Goal

Quality gate enforcement as first-class workflow steps, visibility into agent
activity through dashboards, and structured logging with correlation IDs.

## Context

> **Decided 2026-02-24:** Consolidate quality-gate extension code into the
> product-team plugin instead of maintaining cross-extension coordination. The
> standalone quality-gate CLI (`pnpm q:gate`) remains available.

Quality was previously enforced ad-hoc through CLI scripts. The quality-gate
extension (`extensions/quality-gate/`) contains working parsers, complexity
analyzers, and gate evaluation logic, but operates independently from the
product-team plugin's task lifecycle.

This epic moves quality measurement into the task workflow so that:
1. Quality tools write results directly into `TaskRecord.metadata`
2. Transition guards can evaluate these results automatically
3. An event dashboard provides agent-activity visibility
4. Structured logging with correlation IDs enables debugging

## Tasks

### 5.1 Quality tools consolidation

> **This is NOT a migration from scratch.** Copy working modules from
> `extensions/quality-gate/src/` into `extensions/product-team/src/quality/`.

Modules to copy and adapt:

| Source (quality-gate) | Target (product-team) | Adaptation needed |
|---|---|---|
| `src/exec/spawn.ts` | `src/exec/spawn.ts` | Already needed by EP04 |
| `src/parsers/*.ts` | `src/quality/parsers/*.ts` | Update imports |
| `src/complexity/*.ts` | `src/quality/complexity/*.ts` | Update imports |
| `src/gate/policy.ts` | `src/quality/gate-policy.ts` | Add correlationId param |
| `src/gate/sources.ts` | `src/quality/gate-sources.ts` | Read from TaskRecord |
| `src/gate/types.ts` | `src/quality/types.ts` | No changes |
| `src/fs/*.ts` | `src/quality/fs.ts` | No changes |

Register 5 tools: `quality.tests`, `quality.coverage`, `quality.lint`,
`quality.complexity`, `quality.gate`

**Critical pattern:** Each quality tool auto-writes results to TaskRecord metadata:
```
quality.tests    -> task.metadata.qa_report = { total, passed, failed, skipped, evidence }
quality.coverage -> task.metadata.dev_result.metrics.coverage = <number>
quality.lint     -> task.metadata.dev_result.metrics.lint_clean = <boolean>
quality.complexity -> task.metadata.complexity = { avg, max, files }
quality.gate     -> evaluates all above against scope policy
```

Dependencies to add to product-team `package.json`:
`ts-morph`, `typhonjs-escomplex`, `fast-glob`, `picomatch`

### 5.2 Gate enforcement integration

- Hook quality tools into EP03 step runner
- Define gate rules per transition:
  - `in_progress -> in_review`: coverage >= 80% (major) / 70% (minor), lint clean
  - `in_review -> qa`: no critical review violations
- Gate failures block transition with actionable message

**Acceptance Criteria:**
- Gates evaluated automatically during transitions
- Failed gates produce clear remediation guidance
- Gate rules configurable per scope

### 5.3 Event log dashboard

> **Format: OpenClaw tool** (`workflow.events.query`)

- Tool returns paginated, filterable event history
- Filter by: taskId, agentId, eventType, time range
- Aggregate views: tasks per agent, average cycle time, failure rate
- Maximum 100 results per page
- Read-only (no mutations)

Requires new `queryEvents()` method on `SqliteEventRepository` with SQL
filtering and COUNT aggregation.

**Acceptance Criteria:**
- Dashboard tool returns paginated results with total count
- Supports all filter dimensions
- Includes aggregate stats in response
- No write access through dashboard

### 5.4 Structured logging

- All plugin operations emit structured JSON logs
- Fields: timestamp, level, correlation_id, agent_id, task_id, operation, duration_ms
- Correlation ID threads through entire task lifecycle
- Log levels: debug, info, warn, error

**Acceptance Criteria:**
- All operations produce structured logs
- Correlation IDs consistent across related operations
- Logs parseable by standard log aggregators

## Out of Scope

- Deleting the standalone quality-gate extension (keep for CLI use)
- Security hardening (EP06)
- External monitoring integrations (Datadog, Sentry)
- PR status checks (future enhancement building on EP04)
- Dashboard as web UI (tool-only)

## Task Spec

Full implementation spec with pseudocode, TypeBox schemas, test plan, and
file-by-file breakdown: [`docs/tasks/0006-quality-observability.md`](../tasks/0006-quality-observability.md)

## References

- [Roadmap](../roadmap.md)
- [EP02 -- Task Engine](EP02-task-engine.md)
- [EP03 -- Role Execution](EP03-role-execution.md)
