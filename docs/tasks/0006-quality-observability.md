# Task: 0006 -- Quality & Observability

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP05 -- Quality & Observability |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-24 |
| Branch | `feat/0006-quality-observability` |
| Depends on | 0005 (GitHub Integration) |

---

## Goal

Consolidate quality-gate functionality into the product-team plugin, expose quality
measurement tools as OpenClaw tools, add an event log dashboard tool, and implement
structured logging with correlation IDs across all operations.

---

## Context

The quality-gate extension (`extensions/quality-gate/`) currently exists as a
standalone extension with its own test runner, coverage reporter, lint checker,
complexity analyzer, and gate enforcement logic. However:

1. The product-team plugin's transition guards already reference quality metrics
   (`dev_result.metrics.coverage`, `dev_result.metrics.lint_clean`) but these
   values are set manually by agents -- there is no automated pipeline.
2. Quality-gate tools output JSON but don't write results back to TaskRecord metadata.
3. There is no way for an agent to query the event log beyond `workflow.state.get`.
4. Logging is ad-hoc (`api.logger.info`) with no correlation IDs.

**Design decision (confirmed with user):** Consolidate quality-gate code into
product-team as internal modules. This eliminates the cross-extension coordination
problem and keeps the product-team plugin self-contained.

**What to move from quality-gate:**

| quality-gate module | target in product-team | notes |
|---|---|---|
| `src/exec/spawn.ts` | `src/exec/spawn.ts` | Already used by EP04 (gh-client) |
| `src/parsers/*.ts` | `src/quality/parsers/*.ts` | eslint, vitest, istanbul, ruff |
| `src/complexity/*.ts` | `src/quality/complexity/*.ts` | escomplex, tsmorph |
| `src/gate/policy.ts` | `src/quality/gate-policy.ts` | Gate evaluation logic |
| `src/gate/sources.ts` | `src/quality/gate-sources.ts` | Metric collection |
| `src/gate/types.ts` | `src/quality/types.ts` | GateVerdict, GatePolicy, etc. |
| `src/fs/*.ts` | `src/quality/fs.ts` | File reading utilities |
| `src/tools/*.ts` | `src/tools/quality-*.ts` | Tool registrations (adapted) |

**What to keep / remove:**
- `extensions/quality-gate/` remains in the repo as a standalone CLI tool (`pnpm q:gate`)
  but is no longer used as an OpenClaw extension
- `packages/schemas/` remains unchanged (shared schemas)

---

## Scope

### In Scope

- Copy and adapt quality-gate modules into product-team
- Register 5 new tools: `quality.tests`, `quality.coverage`, `quality.lint`,
  `quality.complexity`, `quality.gate`
- Each quality tool writes results to TaskRecord metadata automatically
- Event log dashboard: `workflow.events.query` tool
- Structured logging: `CorrelatedLogger` wrapper with correlation IDs
- Update transition guards to use quality tool results directly

### Out of Scope

- Deleting the standalone quality-gate extension (keep for CLI use)
- External monitoring integrations (Datadog, Sentry, etc.)
- PR status checks (future enhancement building on EP04)
- Dashboard as a web UI (tool-only)

---

## Requirements

### Functional

1. `quality.tests` runs `vitest` and writes results to `task.metadata.qa_report`
2. `quality.coverage` parses coverage reports and writes to `task.metadata.dev_result.metrics.coverage`
3. `quality.lint` runs ESLint and writes to `task.metadata.dev_result.metrics.lint_clean`
4. `quality.complexity` measures cyclomatic complexity and stores results
5. `quality.gate` evaluates all metrics against the task's scope policy and returns pass/fail
6. `workflow.events.query` supports filtering by: taskId, agentId, eventType, timeRange; with pagination
7. All operations include a correlation ID that threads through logs and events
8. Quality tools auto-update TaskRecord metadata (not just return results)

### Non-Functional

9. Quality tool execution timeout: 120 seconds (configurable)
10. Event query returns max 100 results per page
11. Structured logs: JSON format with fields `ts`, `level`, `correlationId`, `agentId`, `taskId`, `op`, `durationMs`
12. No duplicate quality results: running the same quality tool twice overwrites previous results

---

## Acceptance Criteria

- [ ] AC1: `quality.tests` runs vitest, parses output, stores qa_report in task metadata
- [ ] AC2: `quality.coverage` parses coverage report, stores coverage percentage in task metadata
- [ ] AC3: `quality.lint` runs eslint, parses output, stores lint_clean boolean in task metadata
- [ ] AC4: `quality.complexity` analyzes files, stores complexity metrics in task metadata
- [ ] AC5: `quality.gate` evaluates all quality thresholds for the task's scope and returns verdict
- [ ] AC6: `workflow.events.query` returns paginated events with filters
- [ ] AC7: All operations include correlation IDs in both logs and event records
- [ ] AC8: Structured JSON logs emitted for all operations with required fields
- [ ] AC9: Transition guards can use metadata written by quality tools without manual intervention
- [ ] AC10: quality-gate standalone CLI still works after consolidation
- [ ] AC11: All tests pass, lint clean, types clean, coverage >= 80%

---

## Constraints

- Quality tools must produce output matching `packages/schemas/` JSON schemas
- Do not break the standalone `quality-gate` CLI (`pnpm q:gate` must still work)
- Structured logging must use the `api.logger` interface (extend, don't replace)
- All quality tool output must conform to the role output schemas (qa_report, dev_result)

---

## Implementation Steps

### Step 1: Copy quality-gate modules

Create `src/quality/` directory in product-team:

```
extensions/product-team/src/quality/
  types.ts              # GateVerdict, GatePolicy, etc. (from gate/types.ts)
  parsers/
    eslint.ts           # (from parsers/eslint.ts)
    vitest.ts           # (from parsers/vitest.ts)
    istanbul.ts         # (from parsers/istanbul.ts)
    ruff.ts             # (from parsers/ruff.ts)
    types.ts            # (from parsers/types.ts)
  complexity/
    escomplex.ts        # (from complexity/escomplex.ts)
    tsmorph.ts          # (from complexity/tsmorph.ts)
    types.ts            # (from complexity/types.ts)
  gate-policy.ts        # (from gate/policy.ts)
  gate-sources.ts       # (from gate/sources.ts)
```

**Adaptation needed:**
- Update import paths to use product-team's module structure
- Add `api.logger` calls instead of `console.log`
- Each module gets a `correlationId` parameter threaded through

### Step 2: Correlated logger

Create `src/logging/correlated-logger.ts`:

```typescript
export interface CorrelatedLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function createCorrelatedLogger(
  baseLogger: { info: (msg: string) => void; warn: (msg: string) => void },
  correlationId: string,
  defaults?: { agentId?: string; taskId?: string },
): CorrelatedLogger {
  return {
    info(message, context) {
      baseLogger.info(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        correlationId,
        agentId: defaults?.agentId,
        taskId: defaults?.taskId,
        op: message,
        ...context,
      }));
    },
    // ... debug, warn, error similarly
  };
}
```

### Step 3: Quality tool schemas

Create TypeBox schemas for each quality tool in `src/schemas/`:

```typescript
// quality-tests.schema.ts
export const QualityTestsParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  command: Type.Optional(Type.String()),  // default: 'pnpm test'
  workingDir: Type.Optional(Type.String()),
});

// quality-coverage.schema.ts
export const QualityCoverageParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  reportPath: Type.Optional(Type.String()),  // auto-detect if not provided
  format: Type.Optional(Type.Union([
    Type.Literal('istanbul-json-summary'),
    Type.Literal('lcov'),
  ])),
});

// quality-lint.schema.ts
export const QualityLintParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  paths: Type.Optional(Type.Array(Type.String())),  // default: ['src/**/*.ts']
});

// quality-complexity.schema.ts
export const QualityComplexityParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  rev: Type.Integer({ minimum: 0 }),
  paths: Type.Optional(Type.Array(Type.String())),
});

// quality-gate.schema.ts
export const QualityGateParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  agentId: Type.String({ minLength: 1 }),
  scope: Type.Optional(Type.Union([
    Type.Literal('major'),
    Type.Literal('minor'),
    Type.Literal('patch'),
  ])),  // default: use task.scope
});
```

### Step 4: Quality tools implementation

Each quality tool follows this pattern:

```typescript
// Pseudocode for quality.tests tool
export function qualityTestsToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'quality.tests',
    label: 'Run Tests',
    description: 'Run test suite and store qa_report in task metadata',
    parameters: QualityTestsParams,
    async execute(params) {
      // 1. Validate params
      // 2. Fetch task (verify exists, get rev)
      // 3. Run tests via safeSpawn('pnpm test --reporter=json')
      // 4. Parse output with parseVitestOutput()
      // 5. Build qa_report: { total, passed, failed, skipped, evidence: [...] }
      // 6. Update task metadata: task.metadata.qa_report = qa_report
      //    via taskRepo.update(taskId, { metadata: { ...existing, qa_report } }, rev)
      // 7. Log event: eventLog.logWorkflowStep(...)
      // 8. Return qa_report
    },
  };
}
```

**Critical detail:** Quality tools must read the current task metadata, merge
the quality result into it (not overwrite the entire metadata object), and update
with optimistic locking.

### Step 5: Event query tool

Create `src/tools/workflow-events-query.ts`:

```typescript
// workflow.events.query tool
export const WorkflowEventsQueryParams = Type.Object({
  taskId: Type.Optional(Type.String()),
  agentId: Type.Optional(Type.String()),
  eventType: Type.Optional(Type.String()),
  since: Type.Optional(Type.String({ format: 'date-time' })),
  until: Type.Optional(Type.String({ format: 'date-time' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
});

// Response shape:
interface EventQueryResult {
  events: EventRecord[];
  total: number;
  aggregates: {
    byAgent: Record<string, number>;
    byEventType: Record<string, number>;
    avgCycleTimeMs: number | null;
  };
}
```

This requires adding a new query method to `SqliteEventRepository`:

```typescript
// New method in event-repository.ts
queryEvents(filters: {
  taskId?: string;
  agentId?: string;
  eventType?: string;
  since?: string;
  until?: string;
  limit: number;
  offset: number;
}): { events: EventRecord[]; total: number }
```

### Step 6: Structured logging integration

Update `src/index.ts` to wrap `api.logger` with correlated logger:
- Generate a `pluginCorrelationId` at startup
- Each tool execution generates a per-call `correlationId = ulid()`
- Pass the correlated logger through `ToolDeps`

### Step 7: Update transition guards

Transition guards already read from `task.metadata`. After quality tools write
to metadata automatically, the guards "just work." However, add a convenience:

```typescript
// In transition-guards.ts: add helper that checks if quality tools have been run
export function getMissingQualityEvidence(task: TaskRecord, toStatus: TaskStatus): string[] {
  const missing: string[] = [];
  if (toStatus === 'in_review') {
    if (!task.metadata.dev_result) missing.push('Run quality.coverage and quality.lint first');
  }
  if (toStatus === 'done') {
    if (!task.metadata.qa_report) missing.push('Run quality.tests first');
  }
  return missing;
}
```

### Step 8: Update tool registry and dependencies

- Add quality-gate dependencies to product-team's `package.json`:
  `ts-morph`, `typhonjs-escomplex`, `fast-glob`, `picomatch`
- Update `ToolDeps` interface with quality-specific dependencies
- Update `getAllToolDefs()` to include 6 new tools (5 quality + 1 events query)

---

## Testing Plan

### Unit Tests

| Test file | What to test |
|-----------|-------------|
| `test/quality/parsers/eslint.test.ts` | Port from quality-gate, adapt imports |
| `test/quality/parsers/vitest.test.ts` | Port from quality-gate |
| `test/quality/parsers/istanbul.test.ts` | Port from quality-gate |
| `test/quality/complexity/*.test.ts` | Port from quality-gate |
| `test/quality/gate-policy.test.ts` | Port from quality-gate |
| `test/logging/correlated-logger.test.ts` | JSON output format, field presence, correlation IDs |
| `test/tools/quality-tests.test.ts` | Mock safeSpawn, verify metadata write |
| `test/tools/quality-coverage.test.ts` | Mock file read, verify metadata write |
| `test/tools/quality-lint.test.ts` | Mock safeSpawn, verify metadata write |
| `test/tools/quality-complexity.test.ts` | Mock file read, verify metadata write |
| `test/tools/quality-gate.test.ts` | Mock metadata read, verify verdict |
| `test/tools/workflow-events-query.test.ts` | Filter, pagination, aggregates |

### Integration Tests

| Test | What to test |
|------|-------------|
| `test/integration/quality-pipeline.test.ts` | Run quality tool -> transition -> verify guard passes |

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 80% major)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] Code reviewed (if applicable)
- [x] PR created and linked
