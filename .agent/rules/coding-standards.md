# Coding Standards

## TypeScript Configuration

- TypeScript 5+ with `strict: true` in `tsconfig.json`.
- Target: `ES2022` or later.
- Module: `NodeNext` (ESM).
- All compiler strict flags enabled: `strictNullChecks`,
  `strictFunctionTypes`, `strictBindCallApply`, `noImplicitAny`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch`.

**Reference config:** `extensions/product-team/tsconfig.json`

---

## Module System

- ESM exclusively (`"type": "module"` in `package.json`).
- All import paths MUST use `.js` extensions, even for `.ts` source files:
  ```typescript
  // Correct
  import { TaskRecord } from './domain/task-record.js';
  import { TaskStatus } from './domain/task-status.js';
  import { SqliteTaskRepository } from './persistence/task-repository.js';

  // Wrong -- missing extension
  import { TaskRecord } from './domain/task-record';
  ```
- Use named exports. Avoid default exports unless required by a framework.
- Only exception: the plugin entry point uses a default export for the plugin descriptor:
  ```typescript
  // src/index.ts -- only place where default export is appropriate
  export default { id: 'product-team', name: 'Product Team Engine', register };
  ```

---

## Type Safety

- **No `any`** -- use `unknown` with type guards when the type is truly
  unknown.

  **Codebase example -- type guard pattern:**
  ```typescript
  // src/orchestrator/transition-guards.ts
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function asNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  // Usage:
  const architecturePlan = task.metadata.architecture_plan;
  if (!isRecord(architecturePlan)) {
    return [{ field: 'architecture_plan', message: 'is required' }];
  }
  ```

- No `@ts-ignore`. Use `@ts-expect-error` only with a comment explaining why,
  and only as a last resort.
- Prefer `interface` for object shapes, `type` for unions and intersections.
  ```typescript
  // Interface for object shapes
  interface TaskRecord {
    readonly id: string;
    title: string;
    status: TaskStatus;
  }

  // Type for unions
  type TaskStatus = 'backlog' | 'grooming' | 'design' | 'in_progress' | 'in_review' | 'qa' | 'done';
  ```
- Use `readonly` for properties that should not be mutated.
  ```typescript
  interface TaskRecord {
    readonly id: string;        // Immutable after creation
    readonly createdAt: string;  // Immutable after creation
    title: string;              // Mutable
    updatedAt: string;          // Mutable
  }
  ```
- Use `as const` for literal types.
  ```typescript
  // src/domain/task-status.ts
  export const TaskStatus = {
    Backlog: 'backlog',
    Grooming: 'grooming',
    // ...
  } as const;

  export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
  ```

---

## Formatting

- **2-space indentation** (no tabs).
- **Single quotes** for strings.
- **Trailing commas** in multi-line arrays, objects, parameters.
- **Semicolons** required.
- Max line length: 100 characters (soft limit, 120 hard limit).
- One blank line between top-level declarations.
- No trailing whitespace.

---

## Naming Conventions

| Element | Convention | Codebase Example |
|---------|------------|------------------|
| Files | `kebab-case.ts` | `task-record.ts`, `event-log.ts` |
| Schema files | `kebab-case.schema.ts` | `task-create.schema.ts` |
| Test files | `kebab-case.test.ts` | `task-record.test.ts` |
| Classes | `PascalCase` | `SqliteTaskRepository`, `EventLog` |
| Interfaces | `PascalCase` | `TaskRecord`, `TransitionGuardConfig` |
| Functions | `camelCase` | `createTaskRecord`, `isValidTransition` |
| Variables | `camelCase` | `taskRepo`, `eventLog`, `generateId` |
| Constants | `UPPER_SNAKE_CASE` | `ALL_STATUSES`, `VALID_TRANSITIONS`, `DEFAULT_TRANSITION_GUARD_CONFIG` |
| Enum-like objects | `PascalCase` (const object) | `TaskStatus.InProgress` |
| Type parameters | `T` prefix or single letter | `TResult` |
| Tool names | `namespace.action` | `task.create`, `vcs.branch.create`, `quality.tests` |

---

## Error Handling

- **No bare catch blocks**. Always handle the error:
  ```typescript
  // Wrong
  try { ... } catch (e) { }

  // Correct
  try { ... } catch (error) {
    logger.error('Failed to create task', { error, taskId });
    throw new TaskCreationError('Failed to create task', { cause: error });
  }
  ```
- Use custom error classes from `src/domain/errors.ts`:
  ```typescript
  // Existing custom errors:
  TaskNotFoundError     // task.get with invalid ID
  StaleRevisionError    // optimistic locking conflict
  InvalidTransitionError // invalid state transition
  LeaseConflictError    // another agent holds the lease
  LeaseNotHeldError     // trying to release lease you don't own
  ValidationError       // TypeBox schema validation failure
  TransitionGuardError   // guard evidence missing/insufficient
  ```
- Always include context in error messages (what was being done, relevant IDs).
- Rethrow or wrap errors -- do not silently swallow them.
- Exception: shutdown handlers may log and continue:
  ```typescript
  // src/index.ts -- acceptable to catch on shutdown
  const closeDb = () => {
    try {
      db.close();
    } catch (error: unknown) {
      api.logger.warn(`failed to close database: ${String(error)}`);
    }
  };
  ```

---

## Async Patterns

- Use `async/await` exclusively. Do not use raw `.then()/.catch()` chains.
- Always handle promise rejections.
- Use `Promise.all()` for independent concurrent operations.
- Use `Promise.allSettled()` when partial failures are acceptable.

**Note:** Most product-team code is synchronous because `better-sqlite3` uses
synchronous APIs. Async is needed for: subprocess execution (`safeSpawn`),
file I/O, and network calls (gh CLI).

---

## File Size

- Files MUST NOT exceed **500 lines of code** (excluding blank lines and
  comments).
- If a file grows beyond this limit, refactor by extracting cohesive units into
  separate modules.
- Current largest files for reference:
  - `transition-guards.ts`: ~330 lines
  - `state-machine.ts`: ~210 lines
  - `step-runner.ts`: ~180 lines

---

## Functions

- Prefer pure functions where possible.
- Functions should have a single, clear responsibility.
- Maximum 4 parameters. Use an options object for more:
  ```typescript
  // Wrong -- too many parameters
  function transition(db, taskRepo, orchRepo, eventLog, leaseRepo, guardConfig, taskId, toStatus, agentId) { ... }

  // Correct -- options object pattern used in codebase
  interface TransitionParams {
    db: Database;
    taskRepo: SqliteTaskRepository;
    orchestratorRepo: SqliteOrchestratorRepository;
    // ...
  }
  function transition(params: TransitionParams): TransitionResult { ... }

  // Also correct -- dependency injection via ToolDeps
  export function taskCreateToolDef(deps: ToolDeps): ToolDef { ... }
  ```
- Document public functions with JSDoc comments including `@param` and
  `@returns`.

---

## Dependency Injection Pattern

The codebase uses a `ToolDeps` interface for constructor-based DI:

```typescript
// src/tools/index.ts
export interface ToolDeps {
  db: Database;
  taskRepo: SqliteTaskRepository;
  orchestratorRepo: SqliteOrchestratorRepository;
  leaseRepo: SqliteLeaseRepository;
  eventLog: EventLog;
  generateId: () => string;
  now: () => string;
  validate: ValidateFn;
  transitionGuardConfig: TransitionGuardConfig;
}
```

All tools receive `deps` and use it to access infrastructure. This makes
testing easy (swap real repos for in-memory ones) and keeps tools thin.
