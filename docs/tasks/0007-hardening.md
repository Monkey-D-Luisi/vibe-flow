# Task: 0007 -- Hardening

## Metadata

| Field | Value |
|-------|-------|
| Status | PENDING |
| Epic | EP06 -- Hardening |
| Priority | MEDIUM |
| Scope | MAJOR |
| Created | 2026-02-24 |
| Branch | `feat/0007-hardening` |
| Depends on | 0005 (GitHub Integration), 0006 (Quality & Observability) |

---

## Goal

Prepare the product-team plugin for production use by auditing tool allow-lists,
adding cost tracking (LLM tokens + agent wall-clock time), hardening secrets
management, enforcing concurrency limits, and creating operational documentation.

---

## Context

After EP04 (GitHub Integration) and EP05 (Quality & Observability), the product-team
plugin will have all functional capabilities. This task addresses non-functional
requirements that make the system safe, observable, and sustainable in production.

**Design decisions (confirmed with user):**
- Cost tracking covers both LLM token counts and agent wall-clock time per task
- Both are recorded in the event log as structured events
- Secrets management scope: only DB path validation and ensuring no secrets leak
  into metadata/logs (GitHub auth is via pre-configured `gh` CLI, no token handling)
- Concurrency limits: max parallel tasks per agent, enforced via lease count checks

**Current state:**
- Tool allow-lists in `openclaw.json` exist but are not validated against registered tools
- No cost tracking exists
- DB path validation exists (`src/index.ts` workspace containment check) but no
  metadata/log scrubbing
- Lease mechanism exists but no limit on total concurrent leases per agent
- No runbook or API reference documentation

---

## Scope

### In Scope

- Tool allow-list audit and CI validation
- Cost tracking: LLM tokens and agent wall-clock time in event log
- Secrets management: metadata scrubbing, log sanitization, DB path audit
- Concurrency limits: per-agent lease caps
- Runbook document
- API reference for all registered tools

### Out of Scope

- Performance benchmarking / optimization
- Multi-repo support
- External secret vaults (AWS SSM, HashiCorp Vault)
- Rate limiting against GitHub API (handled by `gh` CLI natively)

---

## Requirements

### Functional

1. CI check validates that every tool in `openclaw.json` allow-lists is actually registered
2. CI check validates that no agent has access to tools outside its role
3. Cost events record `input_tokens`, `output_tokens`, `model`, `duration_ms` per operation
4. Per-task cost summary available via `task.get` (aggregated from events)
5. Per-task budget limit configurable in task metadata (`metadata.budget`)
6. Budget exceeded triggers warning event (does not hard-block, just warns)
7. Metadata values are checked for secret-like patterns before persistence
8. Structured logs are sanitized (no tokens, keys, passwords in output)
9. Per-agent concurrent lease limit configurable (default: 3)
10. When limit exceeded, `task.transition` returns a clear error
11. Runbook covers: setup, configuration, troubleshooting, recovery

### Non-Functional

12. Allow-list validation runs in < 5 seconds in CI
13. Cost tracking adds < 1ms overhead per operation (in-memory accumulator, async flush)
14. Secret detection uses pattern matching, not ML (deterministic, no false negatives)

---

## Acceptance Criteria

- [ ] AC1: CI job validates openclaw.json tool allow-lists against registered tools
- [ ] AC2: CI fails if an allow-list references an unregistered tool
- [ ] AC3: Cost events emitted for every workflow step with token counts
- [ ] AC4: Cost events include wall-clock `duration_ms` for every tool execution
- [ ] AC5: `task.get` returns `costSummary: { totalTokens, totalDurationMs, eventCount }`
- [ ] AC6: Per-task budget limit in metadata triggers warning event when exceeded
- [ ] AC7: Secret-like values in metadata are rejected before persistence
- [ ] AC8: Structured logs contain no secret-like patterns
- [ ] AC9: Per-agent concurrent lease limit enforced (configurable, default 3)
- [ ] AC10: Lease limit exceeded returns `LeaseCapacityError` with actionable message
- [ ] AC11: Runbook document covers all operational scenarios
- [ ] AC12: API reference documents all tools with parameters and examples
- [ ] AC13: All tests pass, lint clean, types clean, coverage >= 80%

---

## Constraints

- Cost tracking must not break existing event log schema (add new event types)
- Secret detection must be deterministic (regex-based, not ML)
- Concurrency limits must work with existing lease mechanism (no new tables)
- Runbook must be a single markdown file in `docs/`

---

## Implementation Steps

### Step 1: Tool allow-list validator

Create a CI script that:

```typescript
// scripts/validate-allowlists.ts (or as a test file)
// 1. Load openclaw.json
// 2. Instantiate the plugin to get registered tool names
// 3. For each agent in agents.list:
//    - Verify every tool in tools.allow is in the registered set
//    - Verify no wildcards (unless explicitly documented)
// 4. Exit with non-zero if validation fails

// Pseudocode:
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('openclaw.json', 'utf-8'));
const registeredTools = new Set(['task.create', 'task.get', /* ... all tools */]);

for (const agent of config.agents.list) {
  for (const tool of agent.tools.allow) {
    if (!registeredTools.has(tool)) {
      console.error(`Agent "${agent.id}" references unregistered tool: ${tool}`);
      process.exitCode = 1;
    }
  }
}
```

Add to CI workflow:
```yaml
- name: Validate tool allow-lists
  run: pnpm tsx scripts/validate-allowlists.ts
```

### Step 2: Cost tracking events

Add new event types to the event system:

```typescript
// New event types (in event-log.ts)
interface CostEvent {
  eventType: 'cost.llm' | 'cost.tool';
  payload: {
    model?: string;        // for LLM events
    inputTokens?: number;  // for LLM events
    outputTokens?: number; // for LLM events
    toolName?: string;     // for tool events
    durationMs: number;    // wall-clock time
  };
}

// New method in EventLog:
logCostEvent(taskId: string, agentId: string, cost: CostEvent['payload']): void {
  this.eventRepo.append({
    id: this.generateId(),
    taskId,
    eventType: cost.model ? 'cost.llm' : 'cost.tool',
    agentId,
    payload: JSON.stringify(cost),
    createdAt: this.now(),
  });
}
```

Wrap each tool's `execute()` with timing:

```typescript
// In tool registration (tools/index.ts or a wrapper)
function withCostTracking(tool: ToolDef, eventLog: EventLog): ToolDef {
  const originalExecute = tool.execute;
  return {
    ...tool,
    async execute(params) {
      const start = performance.now();
      try {
        return await originalExecute(params);
      } finally {
        const durationMs = Math.round(performance.now() - start);
        // Extract taskId from params if available
        const taskId = (params as Record<string, unknown>).taskId;
        const agentId = (params as Record<string, unknown>).agentId;
        if (typeof taskId === 'string' && typeof agentId === 'string') {
          eventLog.logCostEvent(taskId, agentId, {
            toolName: tool.name,
            durationMs,
          });
        }
      }
    },
  };
}
```

### Step 3: Cost summary in task.get

Update `task.get` tool to aggregate cost data:

```typescript
// In task-get.ts, after fetching task + orchestrator state:
const costEvents = eventRepo.getByTaskId(task.id)
  .filter(e => e.eventType.startsWith('cost.'));

const costSummary = {
  totalTokens: costEvents.reduce((sum, e) => {
    const p = JSON.parse(e.payload);
    return sum + (p.inputTokens ?? 0) + (p.outputTokens ?? 0);
  }, 0),
  totalDurationMs: costEvents.reduce((sum, e) => {
    const p = JSON.parse(e.payload);
    return sum + (p.durationMs ?? 0);
  }, 0),
  eventCount: costEvents.length,
};

return { task, orchestratorState, costSummary };
```

### Step 4: Budget limits

Budget is stored in `task.metadata.budget`:

```typescript
interface TaskBudget {
  maxTokens?: number;      // max LLM tokens for this task
  maxDurationMs?: number;  // max wall-clock time
  warningEmitted?: boolean; // prevent duplicate warnings
}

// Check in cost tracking wrapper:
if (budget && !budget.warningEmitted) {
  if (costSummary.totalTokens > (budget.maxTokens ?? Infinity)) {
    eventLog.logCostEvent(taskId, agentId, {
      toolName: '__budget_warning',
      durationMs: 0,
    });
    // Update metadata to mark warning emitted
  }
}
```

### Step 5: Secret detection

Create `src/security/secret-detector.ts`:

```typescript
const SECRET_PATTERNS: RegExp[] = [
  /ghp_[a-zA-Z0-9]{36}/,           // GitHub personal access token
  /gho_[a-zA-Z0-9]{36}/,           // GitHub OAuth token
  /github_pat_[a-zA-Z0-9_]{82}/,   // GitHub fine-grained PAT
  /sk-[a-zA-Z0-9]{48}/,            // OpenAI API key format
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, // Private keys
  /[a-zA-Z0-9+/]{40,}={1,2}/,      // Base64 encoded secrets (40+ chars)
  /password\s*[:=]\s*.{8,}/i,       // password assignments
  /api[_-]?key\s*[:=]\s*.{8,}/i,   // api key assignments
];

export function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some(pattern => pattern.test(value));
}

export function scrubSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  // Deep clone and replace secret values with '[REDACTED]'
}

export function validateMetadataNoSecrets(metadata: Record<string, unknown>): string[] {
  // Returns list of field paths that contain secret-like values
  // Throws ValidationError if any found
}
```

Integrate into `task.update` and `task.create` tools:

```typescript
// In task-update.ts, before saving:
if (params.metadata) {
  const secretPaths = validateMetadataNoSecrets(params.metadata);
  if (secretPaths.length > 0) {
    throw new ValidationError(
      `Metadata contains secret-like values at: ${secretPaths.join(', ')}`
    );
  }
}
```

### Step 6: Concurrency limits

Add config and enforcement to lease manager:

```typescript
// In lease-manager.ts
export interface ConcurrencyConfig {
  maxLeasesPerAgent: number;  // default: 3
  maxTotalLeases: number;     // default: 10
}

// Before acquiring a lease:
const activeLeases = this.leaseRepo.countByAgent(agentId);
if (activeLeases >= config.maxLeasesPerAgent) {
  throw new LeaseCapacityError(agentId, activeLeases, config.maxLeasesPerAgent);
}
```

Add `countByAgent` to `SqliteLeaseRepository`:

```sql
SELECT COUNT(*) FROM leases
WHERE agent_id = ? AND expires_at > datetime('now')
```

Add `LeaseCapacityError` to `src/domain/errors.ts`:

```typescript
export class LeaseCapacityError extends Error {
  constructor(agentId: string, current: number, max: number) {
    super(`Agent ${agentId} has ${current}/${max} concurrent leases. Release a task before acquiring a new one.`);
    this.name = 'LeaseCapacityError';
  }
}
```

### Step 7: Runbook

Create `docs/runbook.md` covering:

1. **Prerequisites**: Node 22+, pnpm, gh CLI authenticated
2. **Installation**: `pnpm install`
3. **Configuration**: `openclaw.json` fields explained
4. **Starting the gateway**: How to run OpenClaw with the plugin
5. **Common operations**: Create task, transition, run quality checks
6. **Troubleshooting**:
   - Database locked: Check for stale leases, WAL mode
   - Transition guard failures: How to check what evidence is missing
   - Budget exceeded: How to increase or reset
   - gh CLI errors: How to verify auth, check rate limits
7. **Recovery**: How to reset a stuck task (manual DB query with warnings)

### Step 8: API reference

Create `docs/api-reference.md` documenting every registered tool:

| Tool | Parameters | Returns | Agent | Notes |
|------|-----------|---------|-------|-------|
| `task.create` | title, scope?, ... | { task, orchestratorState } | pm | Creates task + orchestrator state |
| ... | | | | |

Include example JSON for every tool's input and output.

---

## Testing Plan

### Unit Tests

| Test file | What to test |
|-----------|-------------|
| `test/security/secret-detector.test.ts` | All patterns, false positives, edge cases |
| `test/orchestrator/lease-manager.test.ts` | Capacity limits, countByAgent, error messages |
| `test/tools/task-get.test.ts` | Cost summary aggregation |
| `test/tools/cost-tracking.test.ts` | withCostTracking wrapper, timing, event emission |
| `scripts/validate-allowlists.test.ts` | Valid config, missing tool, wildcard detection |

### Integration Tests

| Test | What to test |
|------|-------------|
| `test/integration/concurrency.test.ts` | Acquire N+1 leases, verify error at limit |
| `test/integration/secret-rejection.test.ts` | Create task with secret-like metadata, verify rejection |
| `test/integration/cost-pipeline.test.ts` | Execute tools, verify cost events, verify summary |

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Tests written and passing
- [ ] Coverage meets threshold (>= 80% major)
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
- [ ] Runbook reviewed by user
- [ ] API reference complete for all tools
- [ ] Code reviewed (if applicable)
- [ ] PR created and linked
