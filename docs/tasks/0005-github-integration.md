# Task: 0005 -- GitHub Integration

## Metadata

| Field | Value |
|-------|-------|
| Status | PENDING |
| Epic | EP04 -- GitHub Integration |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-24 |
| Branch | `feat/0005-github-integration` |
| Depends on | 0004 (coverage debt resolved) |

---

## Goal

Add GitHub automation tools to the product-team plugin so the infra agent can
create branches, open/update pull requests, sync labels, and post CI feedback --
all through idempotent `gh` CLI wrappers tracked in the event log.

---

## Context

The product-team plugin (EP02/EP03) manages tasks through a strict state machine,
but the **infra agent** currently has no tools to interact with GitHub. The
`github-automation` skill (`skills/github-automation/SKILL.md`) describes the
desired capabilities but has no backing implementation.

**Design decisions (confirmed with the user):**
- Wrap the `gh` CLI rather than using Octokit directly (consistent with
  quality-gate's `safeSpawn` pattern in `extensions/quality-gate/src/exec/spawn.ts`)
- Assume `gh auth status` is pre-configured in the agent environment
- Idempotency via a dedicated `ext_requests` table with payload hashing

**Existing infrastructure to reuse:**
- `safeSpawn` from quality-gate for safe subprocess execution with timeouts,
  output truncation, and shell metacharacter rejection
- `SqliteEventRepository` and `EventLog` for audit logging
- TypeBox + `createValidator()` for schema validation
- `better-sqlite3` for the new `ext_requests` table

**Architecture (hexagonal layers):**
```
src/github/             # New Layer 5 (outermost)
  gh-client.ts          # gh CLI wrapper functions
  idempotency.ts        # ext_requests table + hash logic
  branch-service.ts     # Branch creation logic
  pr-service.ts         # PR create/update logic
  label-service.ts      # Label sync logic

src/persistence/
  request-repository.ts # New: SqliteRequestRepository (ext_requests CRUD)
  migrations.ts         # Updated: v2 migration adds ext_requests table

src/schemas/
  vcs-*.schema.ts       # New: TypeBox schemas for each VCS tool

src/tools/
  vcs-branch-create.ts  # New tool
  vcs-pr-create.ts      # New tool
  vcs-pr-update.ts      # New tool
  vcs-label-sync.ts     # New tool
  index.ts              # Updated: include VCS tools in getAllToolDefs()
```

---

## Scope

### In Scope

- `gh` CLI wrapper with `safeSpawn` integration
- `ext_requests` table for idempotency tracking
- Four VCS tools: `vcs.branch.create`, `vcs.pr.create`, `vcs.pr.update`, `vcs.label.sync`
- Event logging for all GitHub operations
- Branch naming convention enforcement
- PR body template auto-population from task metadata
- Tests for all new code

### Out of Scope

- CI webhook listener (future sub-task or EP05)
- PR-Bot skill automation (can be implemented after tools exist)
- Auto-reviewer assignment (requires GitHub team API, future enhancement)
- Quality gate integration with PR checks (EP05)

---

## Requirements

### Functional

1. `vcs.branch.create` creates a branch named `task/<taskId>-<slug>` from a configurable default base
2. `vcs.pr.create` opens a PR with title, body, labels, and base branch
3. `vcs.pr.update` updates PR title, body, labels, or state
4. `vcs.label.sync` ensures a set of labels exist on the repo (create missing, update colors)
5. All operations are idempotent: calling the same operation twice returns the cached result
6. All operations are logged to the event log with `event_type: 'vcs.*'`

### Non-Functional

7. `gh` commands timeout after 30 seconds (configurable)
8. Output from `gh` is truncated at 1MB to prevent memory issues
9. No GitHub token handling -- rely on `gh auth` being pre-configured
10. All `gh` arguments pass through `assertSafeCommand` validation

---

## Acceptance Criteria

- [ ] AC1: `vcs.branch.create` creates a branch via `gh api` and returns `{ branch, sha, created }`
- [ ] AC2: Calling `vcs.branch.create` twice with same params returns cached result (no duplicate branch)
- [ ] AC3: `vcs.pr.create` opens a PR via `gh pr create` and returns `{ number, url, title }`
- [ ] AC4: PR body is auto-populated from task metadata (title, scope, acceptance criteria)
- [ ] AC5: `vcs.pr.update` modifies an existing PR via `gh pr edit`
- [ ] AC6: `vcs.label.sync` creates/updates labels via `gh label create`
- [ ] AC7: All four tools log events to event_log table
- [ ] AC8: `ext_requests` table stores payload hash and cached response for each operation
- [ ] AC9: Branch naming follows `task/<taskId>-<slug>` convention
- [ ] AC10: Invalid branch names (special characters, too long) are rejected with clear error
- [ ] AC11: `gh` command failures return structured error (not raw stderr)
- [ ] AC12: All tests pass, lint clean, types clean, coverage >= 80%

---

## Constraints

- Must use `safeSpawn` from quality-gate (or copy its implementation) -- do not use `child_process` directly
- Must not store GitHub tokens in SQLite or logs
- Branch names limited to 100 characters after `task/` prefix
- PR body template uses the format from `.github/PULL_REQUEST_TEMPLATE/default.md`

---

## Implementation Steps

### Step 1: Migration v2 -- `ext_requests` table

Add migration v2 to `src/persistence/migrations.ts`:

```sql
-- Migration v2: Add ext_requests for idempotency tracking
CREATE TABLE IF NOT EXISTS ext_requests (
  request_id   TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES task_records(id),
  tool         TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  response     TEXT NOT NULL,  -- JSON string
  created_at   TEXT NOT NULL,
  UNIQUE(tool, payload_hash)
);

CREATE INDEX idx_ext_requests_task ON ext_requests(task_id);
CREATE INDEX idx_ext_requests_lookup ON ext_requests(tool, payload_hash);
```

**Key detail:** The `UNIQUE(tool, payload_hash)` constraint is the idempotency
mechanism. Before executing a `gh` command, compute `sha256(JSON.stringify(sortedPayload))`
and query `SELECT response FROM ext_requests WHERE tool = ? AND payload_hash = ?`.

### Step 2: SqliteRequestRepository

Create `src/persistence/request-repository.ts`:

```typescript
// Pseudocode -- repository for ext_requests
export interface RequestRecord {
  readonly requestId: string;
  readonly taskId: string;
  readonly tool: string;
  readonly payloadHash: string;
  readonly response: string;  // JSON
  readonly createdAt: string;
}

export class SqliteRequestRepository {
  constructor(private readonly db: Database) {}

  findByPayloadHash(tool: string, payloadHash: string): RequestRecord | null {
    // SELECT * FROM ext_requests WHERE tool = ? AND payload_hash = ?
  }

  insert(record: RequestRecord): void {
    // INSERT INTO ext_requests (...)
  }
}
```

### Step 3: Idempotency helper

Create `src/github/idempotency.ts`:

```typescript
import { createHash } from 'node:crypto';

export function computePayloadHash(payload: Record<string, unknown>): string {
  // Sort keys deterministically, then SHA-256
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(sorted).digest('hex');
}

export interface IdempotentResult<T> {
  result: T;
  cached: boolean;
}

// withIdempotency wraps a gh operation:
// 1. Compute hash
// 2. Check ext_requests
// 3. If found, return cached response
// 4. If not, execute, store, return
```

### Step 4: GH client wrapper

Create `src/github/gh-client.ts`:

```typescript
// Wraps gh CLI commands using safeSpawn pattern
// Each function returns parsed JSON from gh output

export interface GhClientConfig {
  owner: string;
  repo: string;
  timeoutMs: number;  // default 30_000
}

export class GhClient {
  constructor(private readonly config: GhClientConfig) {}

  async createBranch(name: string, baseSha: string): Promise<{ ref: string; sha: string }> {
    // gh api repos/{owner}/{repo}/git/refs -f ref=refs/heads/{name} -f sha={baseSha}
  }

  async getDefaultBranchSha(): Promise<string> {
    // gh api repos/{owner}/{repo}/git/ref/heads/main --jq '.object.sha'
  }

  async createPr(head: string, base: string, title: string, body: string): Promise<{ number: number; url: string }> {
    // gh pr create --head {head} --base {base} --title {title} --body {body} --json number,url
  }

  async updatePr(number: number, opts: { title?: string; body?: string; state?: string }): Promise<void> {
    // gh pr edit {number} [--title ...] [--body ...] [--state ...]
  }

  async syncLabel(name: string, color: string, description: string): Promise<void> {
    // gh label create {name} --color {color} --description {description} --force
  }
}
```

**Important**: All string arguments that go into commands must be validated:
- Branch names: `/^[a-zA-Z0-9._\/-]+$/` (max 100 chars)
- Label names: `/^[a-zA-Z0-9 _-]+$/` (max 50 chars)
- PR titles: no shell metacharacters, max 256 chars
- PR bodies: passed via `--body-file` using a temp file (avoids shell escaping issues)

### Step 5: Service layer

Create individual service files that combine GhClient + idempotency + event logging:

- `src/github/branch-service.ts` -- `createTaskBranch(taskId, slug)`
- `src/github/pr-service.ts` -- `createTaskPr(taskId, opts)`, `updateTaskPr(prNumber, opts)`
- `src/github/label-service.ts` -- `syncLabels(taskId, labels[])`

Each service:
1. Validates inputs
2. Calls `withIdempotency()` wrapping the GhClient call
3. Logs event via EventLog

### Step 6: TypeBox schemas

Create schema files in `src/schemas/`:

```typescript
// vcs-branch-create.schema.ts
export const VcsBranchCreateParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  slug: Type.String({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', maxLength: 80 }),
  base: Type.Optional(Type.String()),
});

// vcs-pr-create.schema.ts
export const VcsPrCreateParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  title: Type.String({ minLength: 1, maxLength: 256 }),
  body: Type.Optional(Type.String({ maxLength: 65536 })),
  labels: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
  base: Type.Optional(Type.String()),
  draft: Type.Optional(Type.Boolean()),
});

// vcs-pr-update.schema.ts
export const VcsPrUpdateParams = Type.Object({
  prNumber: Type.Integer({ minimum: 1 }),
  title: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
  body: Type.Optional(Type.String({ maxLength: 65536 })),
  labels: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
  state: Type.Optional(Type.Union([Type.Literal('open'), Type.Literal('closed')])),
});

// vcs-label-sync.schema.ts
export const VcsLabelSyncParams = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  labels: Type.Array(
    Type.Object({
      name: Type.String({ minLength: 1, maxLength: 50 }),
      color: Type.String({ pattern: '^[0-9a-fA-F]{6}$' }),
      description: Type.Optional(Type.String({ maxLength: 100 })),
    }),
    { minItems: 1, maxItems: 50 },
  ),
});
```

### Step 7: Tool registrations

Create tool files following the existing pattern (`src/tools/task-create.ts` as reference):

```typescript
// src/tools/vcs-branch-create.ts
export function vcsBranchCreateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'vcs.branch.create',
    label: 'Create Task Branch',
    description: 'Creates a Git branch for a task (idempotent)',
    parameters: VcsBranchCreateParams,
    async execute(params) {
      deps.validate(VcsBranchCreateParams, params);
      // 1. Verify task exists
      // 2. Build branch name: `task/${taskId}-${slug}`
      // 3. Validate branch name format
      // 4. Call branchService.createTaskBranch()
      // 5. Return { branch, sha, created, cached }
    },
  };
}
```

### Step 8: Update tool index and plugin registration

Update `src/tools/index.ts` to include the four new tools.
Update `src/index.ts` to:
1. Read `pluginConfig.github` for `{ owner, repo, defaultBase }`
2. Create `GhClient` instance
3. Create `SqliteRequestRepository`
4. Create service instances
5. Pass to `getAllToolDefs(deps)` with extended `ToolDeps`

### Step 9: Update openclaw.json

Add the four new tools to the infra agent's allow-list:

```json
{
  "id": "infra",
  "tools": {
    "allow": [
      "vcs.branch.create",
      "vcs.pr.create",
      "vcs.pr.update",
      "vcs.label.sync",
      "task.get",
      "task.search",
      "workflow.state.get"
    ]
  }
}
```

---

## Testing Plan

### Unit Tests

| Test file | What to test |
|-----------|-------------|
| `test/github/idempotency.test.ts` | `computePayloadHash` determinism, key sorting, collision resistance |
| `test/github/gh-client.test.ts` | Mock `safeSpawn`, verify command construction, parse JSON output, handle errors |
| `test/github/branch-service.test.ts` | Branch name validation, idempotency flow, event logging |
| `test/github/pr-service.test.ts` | PR creation with metadata template, update params, body-file usage |
| `test/github/label-service.test.ts` | Label format validation, sync create+update, idempotency |
| `test/persistence/request-repository.test.ts` | CRUD, unique constraint, lookup by hash |
| `test/schemas/vcs-*.test.ts` | Schema validation: valid/invalid inputs for each tool |
| `test/tools/vcs-*.test.ts` | Tool execution with mocked services, error handling |

### Integration Tests

| Test | What to test |
|------|-------------|
| `test/persistence/migrations.test.ts` | v2 migration creates ext_requests table |
| `test/tools/vcs-branch-create.test.ts` | End-to-end with in-memory DB (mock gh CLI) |

### Test Patterns

```typescript
// Mock gh CLI via vi.mock for safeSpawn
vi.mock('../../src/github/gh-client.js', () => ({
  GhClient: vi.fn().mockImplementation(() => ({
    createBranch: vi.fn().mockResolvedValue({ ref: 'refs/heads/task/abc-test', sha: 'abc123' }),
    getDefaultBranchSha: vi.fn().mockResolvedValue('def456'),
  })),
}));

// Test idempotency
it('should return cached result on duplicate call', async () => {
  await tool.execute({ taskId: 'TASK1', slug: 'my-feature' });
  const result = await tool.execute({ taskId: 'TASK1', slug: 'my-feature' });
  expect(result.cached).toBe(true);
  expect(ghClient.createBranch).toHaveBeenCalledTimes(1); // only once
});
```

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Tests written and passing
- [ ] Coverage meets threshold (>= 80% major)
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [ ] PR created and linked
