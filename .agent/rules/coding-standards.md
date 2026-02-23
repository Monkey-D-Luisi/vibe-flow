# Coding Standards

## TypeScript Configuration

- TypeScript 5+ with `strict: true` in `tsconfig.json`.
- Target: `ES2022` or later.
- Module: `NodeNext` (ESM).
- All compiler strict flags enabled: `strictNullChecks`,
  `strictFunctionTypes`, `strictBindCallApply`, `noImplicitAny`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch`.

---

## Module System

- ESM exclusively (`"type": "module"` in `package.json`).
- All import paths MUST use `.js` extensions, even for `.ts` source files:
  ```typescript
  // Correct
  import { TaskRecord } from './domain/task-record.js';

  // Wrong -- missing extension
  import { TaskRecord } from './domain/task-record';
  ```
- Use named exports. Avoid default exports unless required by a framework.

---

## Type Safety

- **No `any`** -- use `unknown` with type guards when the type is truly
  unknown.
- No `@ts-ignore`. Use `@ts-expect-error` only with a comment explaining why,
  and only as a last resort.
- Prefer `interface` for object shapes, `type` for unions and intersections.
- Use `readonly` for properties that should not be mutated.
- Use `as const` for literal types.

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

| Element | Convention | Example |
|---------|------------|---------|
| Files | `kebab-case.ts` | `task-record.ts` |
| Classes / Interfaces | `PascalCase` | `TaskRecord` |
| Functions / Variables | `camelCase` | `createTask` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES` |
| Enums | `PascalCase` (members too) | `TaskStatus.InProgress` |
| Type parameters | Single uppercase letter or `T` prefix | `T`, `TResult` |
| Schema files | `kebab-case.schema.ts` | `task-create.schema.ts` |

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
- Use custom error classes that extend `Error` for domain-specific errors.
- Always include context in error messages (what was being done, relevant IDs).
- Rethrow or wrap errors -- do not silently swallow them.

---

## Async Patterns

- Use `async/await` exclusively. Do not use raw `.then()/.catch()` chains.
- Always handle promise rejections.
- Use `Promise.all()` for independent concurrent operations.
- Use `Promise.allSettled()` when partial failures are acceptable.

---

## File Size

- Files MUST NOT exceed **500 lines of code** (excluding blank lines and
  comments).
- If a file grows beyond this limit, refactor by extracting cohesive units into
  separate modules.

---

## Functions

- Prefer pure functions where possible.
- Functions should have a single, clear responsibility.
- Maximum 4 parameters. Use an options object for more.
- Document public functions with JSDoc comments including `@param` and
  `@returns`.
