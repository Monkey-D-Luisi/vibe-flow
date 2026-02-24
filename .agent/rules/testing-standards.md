# Testing Standards

## Framework

- **Vitest** is the only test framework used in this project.
- Test files live in a `test/` directory at the package root, mirroring the
  `src/` directory structure:
  ```
  src/domain/task-record.ts       -> test/domain/task-record.test.ts
  src/orchestrator/state-machine.ts -> test/orchestrator/state-machine.test.ts
  src/tools/task-create.ts        -> test/tools/task-create.test.ts
  src/schemas/workflow-role.schema.ts -> test/schemas/workflow-role.schema.test.ts
  ```

---

## Methodology: TDD (Red-Green-Refactor)

Every code change follows the TDD cycle:

1. **Red** -- Write a failing test that defines the expected behavior.
2. **Green** -- Write the minimal code to make the test pass.
3. **Refactor** -- Clean up the implementation without changing behavior.
   Verify tests still pass.

Record the RGR cycle in the walkthrough document.

---

## Test Structure and Naming

```typescript
// test/domain/task-record.test.ts
import { describe, it, expect } from 'vitest';
import { createTaskRecord } from '../../src/domain/task-record.js';

describe('createTaskRecord', () => {
  it('should create a task with backlog status', () => {
    // Arrange
    const input = { title: 'Test task' };
    const id = 'TASK-001';
    const now = '2026-02-24T00:00:00.000Z';

    // Act
    const record = createTaskRecord(input, id, now);

    // Assert
    expect(record.status).toBe('backlog');
    expect(record.title).toBe('Test task');
    expect(record.rev).toBe(0);
  });

  it('should default scope to minor', () => {
    const record = createTaskRecord({ title: 'X' }, 'ID', 'NOW');
    expect(record.scope).toBe('minor');
  });
});
```

- Outer `describe` block: module or function name (matches the export).
- Inner `describe` block (optional): method name or scenario group.
- `it` block: starts with "should" and describes expected behavior.
- Use Arrange-Act-Assert (AAA) pattern within each test.

---

## Test Setup Helpers

The codebase uses a shared test helper for database-dependent tests:

```typescript
// test/helpers.ts
import Database from 'better-sqlite3';
import { runMigrations } from '../src/persistence/migrations.js';

export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}
```

**Usage pattern in test files:**

```typescript
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { createTestDatabase } from '../helpers.js';

describe('SqliteTaskRepository', () => {
  let db: Database.Database;
  let repo: SqliteTaskRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteTaskRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create and retrieve a task', () => {
    // ...
  });
});
```

---

## ToolDeps Factory for Tool Tests

Tool tests use a shared dependency factory:

```typescript
// Pattern used in test/tools/*.test.ts
function createDeps(db: Database.Database): ToolDeps {
  const taskRepo = new SqliteTaskRepository(db);
  const orchestratorRepo = new SqliteOrchestratorRepository(db);
  const eventRepo = new SqliteEventRepository(db);
  const leaseRepo = new SqliteLeaseRepository(db);
  let counter = 0;
  return {
    db,
    taskRepo,
    orchestratorRepo,
    leaseRepo,
    eventLog: new EventLog(eventRepo, () => `EVT-${++counter}`, () => '2026-01-01T00:00:00.000Z'),
    generateId: () => `TASK-${++counter}`,
    now: () => '2026-01-01T00:00:00.000Z',
    validate: createValidator(),
    transitionGuardConfig: DEFAULT_TRANSITION_GUARD_CONFIG,
  };
}
```

**Key design choices:**
- Deterministic IDs via counter (no ULIDs in tests)
- Fixed timestamps (no `Date.now()`)
- In-memory database (fast, isolated)

---

## Coverage Targets

| Scope | Threshold |
|-------|-----------|
| Major (new feature, core logic) | >= 80% |
| Minor (config, docs tooling) | >= 70% |

Coverage is measured on statements, branches, and functions. All three
dimensions must meet the threshold.

**Measuring coverage:**

```bash
# Product-team extension
cd extensions/product-team
pnpm test:coverage
# Runs: vitest run --coverage

# Quality-gate extension
cd extensions/quality-gate
pnpm test  # Uses vitest with coverage configured
```

**Coverage config (vitest.config.ts):**

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/schemas/**'],  // Schemas are type-only
    },
  },
});
```

---

## Test Types

### Unit Tests

- Test domain logic and pure functions in isolation.
- No I/O, no database, no network.
- Fast execution (< 100ms per test).
- Location: `test/domain/`, `test/schemas/`.

**Example:**

```typescript
// test/domain/task-status.test.ts
describe('isValidTransition', () => {
  it('should allow backlog -> grooming', () => {
    expect(isValidTransition('backlog', 'grooming')).toBe(true);
  });

  it('should reject backlog -> done', () => {
    expect(isValidTransition('backlog', 'done')).toBe(false);
  });
});
```

### Integration Tests

- Test persistence layer with real SQLite (in-memory database).
- Test orchestrator workflows end-to-end within the plugin.
- May use test fixtures and seed data.
- Location: `test/persistence/`, `test/orchestrator/`, `test/tools/`.

**Example:**

```typescript
// test/persistence/task-repository.test.ts
describe('SqliteTaskRepository', () => {
  let db: Database.Database;
  let repo: SqliteTaskRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteTaskRepository(db);
  });

  afterEach(() => db.close());

  it('should search by status filter', () => {
    // Seed data
    repo.create(createTaskRecord({ title: 'A' }, 'T1', 'NOW'));
    repo.create(createTaskRecord({ title: 'B' }, 'T2', 'NOW'));

    // Act
    const results = repo.search({ status: 'backlog', limit: 10, offset: 0 });

    // Assert
    expect(results.tasks).toHaveLength(2);
    expect(results.total).toBe(2);
  });
});
```

### Contract Tests

- Verify that TypeBox schemas validate expected shapes correctly.
- Test both valid inputs and expected rejections.
- Location: `test/schemas/`.

**Example:**

```typescript
// test/schemas/workflow-role.schema.test.ts
describe('PoBriefSchema', () => {
  it('should validate a complete po_brief', () => {
    const valid = {
      title: 'Add login page',
      acceptance_criteria: ['User can log in'],
      scope: 'major',
      done_if: 'Login works with OAuth',
    };
    expect(() => validate(PoBriefSchema, valid)).not.toThrow();
  });

  it('should reject missing title', () => {
    const invalid = { acceptance_criteria: [], scope: 'major', done_if: 'X' };
    expect(() => validate(PoBriefSchema, invalid)).toThrow(ValidationError);
  });
});
```

---

## Test Quality Rules

- **No skipped tests** without a justification comment explaining why and a
  linked issue for re-enabling.
- **No `.only`** in committed code -- tests must not be focused.
- **Deterministic** -- tests must produce the same result every run. No
  dependence on wall clock time, random values, or external services.
  ```typescript
  // Wrong -- non-deterministic
  const id = ulid();
  const now = new Date().toISOString();

  // Correct -- deterministic
  let counter = 0;
  const generateId = () => `TEST-${++counter}`;
  const now = () => '2026-01-01T00:00:00.000Z';
  ```
- **Independent** -- tests must not depend on execution order. Each test sets
  up its own state via `beforeEach`.
- **Fast** -- the full test suite should complete in under 30 seconds.

---

## Mocking

- Prefer real implementations over mocks (especially for domain logic).
- Use Vitest's built-in `vi.fn()` and `vi.mock()` when mocking is necessary.
- Mock at layer boundaries (e.g., mock the persistence layer when testing the
  orchestrator).
- Never mock the module under test.

**Codebase example -- mock API for index.test.ts:**

```typescript
// test/index.test.ts -- mock the OpenClawPluginApi
function createMockApi(): OpenClawPluginApi {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    pluginConfig: { dbPath: ':memory:' },
    resolvePath: (p: string) => p,
    registerTool: vi.fn(),
  } as unknown as OpenClawPluginApi;
}
```

**When to mock vs use real:**

| Layer | What to use |
|-------|------------|
| Domain tests | Real implementations only |
| Persistence tests | Real in-memory SQLite |
| Orchestrator tests | Real repos + in-memory DB |
| Tool tests | Real repos + in-memory DB (light integration) |
| Index tests | Mock API, real everything else |
| External calls (gh CLI, spawn) | Always mock |

---

## Assertions

- Use Vitest's `expect` API.
- Prefer specific matchers (`toEqual`, `toContain`, `toThrow`) over generic
  ones (`toBeTruthy`).
- For error assertions, verify both the error type and the message:
  ```typescript
  expect(() => isValidTransition('done', 'backlog')).toBe(false);

  // For thrown errors:
  expect(() => taskRepo.update('X', {}, 999))
    .toThrow(StaleRevisionError);
  expect(() => taskRepo.update('X', {}, 999))
    .toThrow(/expected rev=999/);
  ```
- For complex objects, use `toMatchObject` for partial matching:
  ```typescript
  expect(result).toMatchObject({
    task: { id: 'T1', status: 'backlog' },
    orchestratorState: { current: 'backlog' },
  });
  ```

---

## References

- [Error Recovery Patterns](../../docs/error-recovery.md) -- how to handle failures
- [Transition Guard Evidence](../../docs/transition-guard-evidence.md) -- what metadata to set in tests
