# EP05 -- Quality & Observability

| Field       | Value                                            |
|-------------|--------------------------------------------------|
| Epic        | EP05                                             |
| Status      | PENDING                                          |
| Priority    | P2                                               |
| Phase       | 4 -- Quality & Observability                     |
| Target      | July 2026                                        |
| Depends on  | EP02, EP03                                       |
| Blocks      | None                                             |

## Goal

Quality gate enforcement as first-class workflow steps, visibility into agent
activity through dashboards, and structured logging with correlation IDs.

## Context

Quality was previously enforced ad-hoc through CLI scripts. This epic promotes
quality checks to gated workflow steps that block state transitions when
thresholds are not met, and adds observability to understand agent behavior.

## Tasks

### 5.1 Quality tools migration

- Port quality measurement tools from old tooling/quality-mcp
- Implement as OpenClaw plugin tools:

| Tool                   | Description                             |
|------------------------|-----------------------------------------|
| `quality.coverage`     | Measure and report test coverage        |
| `quality.lint`         | Run linter and report violations        |
| `quality.complexity`   | Measure cyclomatic complexity           |

**Acceptance Criteria:**
- All three tools registered and functional
- Tools return structured JSON with metric values
- Results stored in task event log

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

- Read-only API for querying event log
- Filter by task, agent, event type, time range
- Aggregate views: tasks per agent, average cycle time, failure rate
- Expose as `workflow.events.query` tool

**Acceptance Criteria:**
- Dashboard tool returns paginated results
- Supports filtering and aggregation
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

- Security hardening (EP06)
- External monitoring integrations

## References

- [Roadmap](../roadmap.md)
- [EP02 -- Task Engine](EP02-task-engine.md)
- [EP03 -- Role Execution](EP03-role-execution.md)
