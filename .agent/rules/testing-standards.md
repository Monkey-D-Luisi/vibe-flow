# Testing Standards

## Framework

- **Vitest** is the only test framework used in this project.
- Test files are colocated in a `test/` directory at the package root, or
  alongside source files with a `.test.ts` suffix.

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
describe('TaskRecord', () => {
  describe('create', () => {
    it('should create a task with PENDING status', () => {
      // Arrange
      // Act
      // Assert
    });

    it('should reject empty title', () => {
      // ...
    });
  });
});
```

- Outer `describe` block: module or class name.
- Inner `describe` block (optional): method or function name.
- `it` block: starts with "should" and describes expected behavior.
- Use Arrange-Act-Assert pattern within each test.

---

## Coverage Targets

| Scope | Threshold |
|-------|-----------|
| Major (new feature, core logic) | >= 80% |
| Minor (config, docs tooling) | >= 70% |

Coverage is measured on statements, branches, and functions. All three
dimensions must meet the threshold.

---

## Test Types

### Unit Tests

- Test domain logic and pure functions in isolation.
- No I/O, no database, no network.
- Fast execution (< 100ms per test).
- Location: `test/unit/` or `test/domain/`.

### Integration Tests

- Test persistence layer with real SQLite (in-memory database).
- Test orchestrator workflows end-to-end within the plugin.
- May use test fixtures and seed data.
- Location: `test/integration/`.

### Contract Tests

- Verify that tool schemas (TypeBox) match expected shapes.
- Validate that tool registrations produce valid OpenClaw tool descriptors.
- Location: `test/contract/` or `test/schemas/`.

---

## Test Quality Rules

- **No skipped tests** without a justification comment explaining why and a
  linked issue for re-enabling.
- **No `.only`** in committed code -- tests must not be focused.
- **Deterministic** -- tests must produce the same result every run. No
  dependence on wall clock time, random values, or external services.
- **Independent** -- tests must not depend on execution order. Each test sets
  up its own state.
- **Fast** -- the full test suite should complete in under 30 seconds.

---

## Mocking

- Prefer real implementations over mocks (especially for domain logic).
- Use Vitest's built-in `vi.fn()` and `vi.mock()` when mocking is necessary.
- Mock at layer boundaries (e.g., mock the persistence layer when testing the
  orchestrator).
- Never mock the module under test.

---

## Assertions

- Use Vitest's `expect` API.
- Prefer specific matchers (`toEqual`, `toContain`, `toThrow`) over generic
  ones (`toBeTruthy`).
- For error assertions, verify both the error type and the message.
