# Architecture Standards

## OpenClaw Plugin Architecture

### Plugin Entry Point

Every extension MUST export a `register(api)` function as its entry point. The
OpenClaw gateway calls this function at startup, passing the plugin API object.

```typescript
// Reference: extensions/product-team/src/index.ts
export function register(api: OpenClawPluginApi): void {
  // 1. Read plugin config
  const pluginConfig = api.pluginConfig as Record<string, unknown> | undefined;

  // 2. Initialize infrastructure (DB, repos)
  const db = createDatabase(resolvedPath);
  runMigrations(db);

  // 3. Create domain services
  const taskRepo = new SqliteTaskRepository(db);
  const eventLog = new EventLog(eventRepo, generateId, now);

  // 4. Register tools
  const tools = getAllToolDefs(deps);
  for (const tool of tools) {
    api.registerTool(tool);
  }
}
```

### Plugin Manifest

Each extension MUST have an `openclaw.plugin.json` at its root:

```json
{
  "id": "product-team",
  "name": "Product Team Engine",
  "version": "0.1.0",
  "skills": ["../../skills/requirements-grooming", "../../skills/tdd-implementation"],
  "configSchema": {
    "dbPath": "string -- path to SQLite database (relative to workspace root)",
    "github": {
      "owner": "string -- GitHub repo owner",
      "repo": "string -- GitHub repo name",
      "defaultBase": "string -- default base branch (e.g. main)"
    }
  }
}
```

---

## Hexagonal Layers

The plugin is organized into five concentric layers. Dependencies flow
**inward** only.

```
┌─────────────────────────────────────────────────────────┐
│ Layer 5: GitHub (src/github/)                           │
│   gh-client.ts, branch-service.ts, pr-service.ts       │
├─────────────────────────────────────────────────────────┤
│ Layer 4: Tools (src/tools/)                             │
│   task-create.ts, vcs-branch-create.ts, ...             │
├─────────────────────────────────────────────────────────┤
│ Layer 3: Orchestrator (src/orchestrator/)               │
│   state-machine.ts, step-runner.ts, event-log.ts        │
├─────────────────────────────────────────────────────────┤
│ Layer 2: Persistence (src/persistence/)                 │
│   task-repository.ts, event-repository.ts, migrations   │
├─────────────────────────────────────────────────────────┤
│ Layer 1: Domain (src/domain/)  ← innermost              │
│   task-record.ts, task-status.ts, errors.ts              │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: Domain (innermost)

- Location: `src/domain/`
- Contains: TaskRecord, state transitions, validation rules, value objects,
  domain events.
- Rules:
  - **Zero external dependencies** -- no imports from other layers, no npm
    packages (except pure utility types).
  - Pure functions and classes only.
  - All business rules live here.
  - Tested with unit tests (no I/O, no mocks of external systems).

**Codebase example -- pure domain function (no imports from outer layers):**

```typescript
// src/domain/task-status.ts -- pure business rules
export const VALID_TRANSITIONS: ReadonlyMap<TaskStatus, readonly TaskStatus[]> =
  new Map([
    ['backlog', ['grooming']],
    ['grooming', ['design', 'in_progress']],
    ['design', ['in_progress']],
    ['in_progress', ['in_review']],
    ['in_review', ['qa', 'in_progress']],
    ['qa', ['done', 'in_progress']],
    ['done', []],
  ]);

export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  const targets = VALID_TRANSITIONS.get(from);
  return targets !== undefined && targets.includes(to);
}
```

**Codebase example -- domain factory (no side effects):**

```typescript
// src/domain/task-record.ts -- pure factory function
export function createTaskRecord(
  input: CreateTaskInput,
  id: string,
  now: string,
): TaskRecord {
  return {
    id,
    title: input.title,
    status: TaskStatus.Backlog,
    scope: input.scope ?? 'minor',
    assignee: input.assignee ?? null,
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
    rev: 0,
  };
}
```

### Layer 2: Persistence

- Location: `src/persistence/`
- Contains: SQLite repositories, migrations, query builders.
- Rules:
  - Depends only on Domain.
  - Uses `better-sqlite3` for database access.
  - WAL mode enabled at connection time.
  - All SQL queries use parameterized statements (no string concatenation).
  - Migrations are sequential and numbered in the `migrations` array.
  - Repositories implement CRUD patterns with optimistic locking.

**Codebase example -- parameterized query with optimistic locking:**

```typescript
// src/persistence/task-repository.ts
update(id: string, fields: Partial<TaskRecord>, expectedRev: number): TaskRecord {
  const result = this.db.prepare(`
    UPDATE task_records
    SET title = COALESCE(?, title),
        scope = COALESCE(?, scope),
        /* ... */
        rev = rev + 1,
        updated_at = ?
    WHERE id = ? AND rev = ?
  `).run(fields.title, fields.scope, /* ... */ now, id, expectedRev);

  if (result.changes === 0) {
    throw new StaleRevisionError(id, expectedRev, actual.rev);
  }
}
```

**Codebase example -- migration pattern:**

```typescript
// src/persistence/migrations.ts
const MIGRATIONS = [
  // v1: Core tables
  `CREATE TABLE task_records (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'backlog',
    /* ... */
    rev INTEGER NOT NULL DEFAULT 0
  );`,
  // v2 (EP04): Add ext_requests for idempotency
  // `CREATE TABLE ext_requests ( ... );`
];
```

### Layer 3: Orchestrator

- Location: `src/orchestrator/`
- Contains: State machine, lease manager, workflow runner, event log, transition guards.
- Rules:
  - Depends on Domain and Persistence.
  - Coordinates multi-step workflows.
  - Manages task lifecycle transitions.
  - All multi-step operations wrapped in SQLite transactions.
  - No direct HTTP or GitHub calls.

**Codebase example -- transaction wrapping:**

```typescript
// src/orchestrator/state-machine.ts
export function transition(/* ... */): TransitionResult {
  return db.transaction(() => {
    // 1. Validate transition in domain
    // 2. Check lease ownership
    // 3. Evaluate transition guards
    // 4. Update orchestrator state
    // 5. Mirror status to task_records
    // 6. Log event
    // 7. Return result
  })();
}
```

### Layer 4: Tools

- Location: `src/tools/`
- Contains: OpenClaw tool registrations.
- Rules:
  - Thin adapter layer -- minimal logic.
  - Each tool registration uses TypeBox schemas for parameters and return types.
  - Delegates all business logic to Orchestrator or Domain.
  - Handles input validation and error formatting.

**Codebase example -- thin tool adapter:**

```typescript
// src/tools/task-create.ts
export function taskCreateToolDef(deps: ToolDeps): ToolDef {
  return {
    name: 'task.create',
    label: 'Create Task',
    description: 'Creates a new TaskRecord',
    parameters: TaskCreateParams,
    execute(params) {
      deps.validate(TaskCreateParams, params);            // validate
      const id = deps.generateId();                        // generate ID
      const record = createTaskRecord(params, id, now);    // delegate to domain
      deps.taskRepo.create(record);                        // delegate to persistence
      deps.eventLog.logTaskCreated(id, record);            // delegate to orchestrator
      return { task: record };                             // return result
    },
  };
}
```

### Layer 5: GitHub (outermost)

- Location: `src/github/` (EP04)
- Contains: GH CLI client, branch management, PR creation, label sync, idempotency.
- Rules:
  - Depends on all inner layers as needed.
  - All GitHub operations are idempotent via `ext_requests` hash check.
  - Uses `gh` CLI via `safeSpawn` (not Octokit).
  - Handles timeouts and output truncation.

---

## Dependency Rules

```
GitHub  -->  Tools  -->  Orchestrator  -->  Persistence  -->  Domain
(outer)                                                      (inner)
```

- An outer layer MAY import from any inner layer.
- An inner layer MUST NOT import from any outer layer.
- Layers at the same level MUST NOT import from each other.
- Cross-cutting concerns (logging, configuration) use dependency injection.

**Enforcement:** If you need orchestrator logic in a tool, import from
`src/orchestrator/`. If you need domain types in a tool, import from
`src/domain/`. Never import tools from orchestrator.

---

## Schema Definitions

- All tool parameter schemas use **TypeBox** (`@sinclair/typebox`).
- Schemas live in `src/schemas/` and are imported by tool registrations.
- Each schema file exports a `Type` object and an inferred TypeScript type.
- Schema files are named `<tool-name>.schema.ts`.
- Role output schemas are centralized in `src/schemas/workflow-role.schema.ts`.

**Codebase example:**

```typescript
// src/schemas/task-create.schema.ts
import { Type, type Static } from '@sinclair/typebox';

export const TaskCreateParams = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 500 }),
  scope: Type.Optional(Type.Union([
    Type.Literal('major'),
    Type.Literal('minor'),
    Type.Literal('patch'),
  ])),
  tags: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
});

export type TaskCreateInput = Static<typeof TaskCreateParams>;
```

---

## Anti-Patterns to Avoid

1. **Domain importing from Persistence** -- Domain must remain pure. If you
   need data access in domain logic, use repository interfaces defined in
   Domain and implemented in Persistence.
2. **Business logic in Tools layer** -- Tools are thin adapters. Move logic to
   Orchestrator or Domain.
3. **Direct SQL in Orchestrator** -- Use repository abstractions from
   Persistence.
4. **Hardcoded GitHub tokens** -- Use `gh` CLI pre-auth configuration.
5. **Direct child_process usage** -- Use `safeSpawn` for all subprocess execution.
6. **Circular dependencies** -- If module A imports B and B imports A, refactor
   to break the cycle.
7. **God classes** -- No class should exceed 500 LOC or have more than 7 public
   methods.
8. **Transactions spanning layers** -- Keep transaction boundaries in the
   Orchestrator layer. Don't start transactions in Tools.

---

## References

- [Transition Guard Evidence](../../docs/transition-guard-evidence.md)
- [Error Recovery Patterns](../../docs/error-recovery.md)
- [Extension Integration Patterns](../../docs/extension-integration.md)
