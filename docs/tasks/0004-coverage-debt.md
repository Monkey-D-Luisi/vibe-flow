# Task: 0004 -- Coverage Debt Fix

## Metadata

| Field | Value |
|-------|-------|
| Status | IN_PROGRESS |
| Epic | Pre-EP04 prerequisite |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-02-24 |
| Branch | `fix/0004-coverage-debt` |

---

## Goal

Raise test coverage in `extensions/product-team` to >= 80% (statements, branches,
functions) so the MAJOR-scope Definition of Done from tasks 0002 and 0003 is fully
satisfied before proceeding to EP04.

---

## Context

Tasks 0002 (Task Engine) and 0003 (Role Execution) both have the "Coverage meets
threshold >= 80% major" checkbox unmarked in their Definition of Done. The product-team
extension is the core of the system; proceeding without adequate coverage creates
compounding risk as EP04-EP06 build on top of it.

Current state (approximate):
- 147 tests pass (all green)
- Coverage has not been measured with `--coverage` flag in CI
- Likely gaps: `src/orchestrator/step-runner.ts` (complex branching),
  `src/orchestrator/state-machine.ts` (fast-track paths), `src/tools/workflow-step-run.ts`
  (transaction + transition combo), `src/persistence/task-repository.ts` (search filters)

---

## Scope

### In Scope

- Measure current coverage with `pnpm --filter @openclaw/plugin-product-team test:coverage`
- Identify modules below 80% on statements, branches, or functions
- Write targeted tests to close coverage gaps
- Ensure all three dimensions >= 80%

### Out of Scope

- Refactoring production code (only add tests)
- Coverage for `extensions/quality-gate` (different scope)
- Adding coverage to CI (that's EP06)

---

## Requirements

1. Run `vitest run --coverage` and capture the report
2. For each file below 80%, write tests covering the missing paths
3. Focus on branch coverage -- that's typically the hardest to achieve
4. Do not change production code signatures or behavior

---

## Acceptance Criteria

- [ ] AC1: `vitest run --coverage` passes with all files in `src/` at >= 80% statements
- [ ] AC2: `vitest run --coverage` passes with all files in `src/` at >= 80% branches
- [ ] AC3: `vitest run --coverage` passes with all files in `src/` at >= 80% functions
- [ ] AC4: No test regressions (all existing 147+ tests still pass)
- [ ] AC5: Coverage report committed as CI artifact reference in walkthrough

---

## Constraints

- Do not modify production code behavior
- Tests must be deterministic (no Date.now(), no Math.random() without mocking)
- Follow existing test patterns in `test/` (see helpers.ts for setup patterns)

---

## Implementation Steps

### Step 1: Measure baseline

```bash
cd extensions/product-team
pnpm test:coverage
```

Record per-file coverage in the walkthrough.

### Step 2: Identify gap files

Create a table in the walkthrough:

| File | Stmts | Branch | Func | Gap analysis |
|------|-------|--------|------|-------------|
| src/orchestrator/step-runner.ts | ?% | ?% | ?% | Missing: shell step error path, invalid schema key |
| ... | | | | |

### Step 3: Write tests per file (priority order)

For each file below threshold, write tests following the pattern:

```typescript
// test/orchestrator/step-runner.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../helpers.js';

describe('StepRunner', () => {
  // existing tests...

  describe('edge cases for coverage', () => {
    it('should handle shell step with non-zero exit code', () => {
      // Arrange: set up step with type: 'shell', output: { exitCode: 1, ... }
      // Act: call runWorkflowSteps
      // Assert: step result stored in metadata.custom_steps
    });

    it('should reject llm-task step with invalid schemaKey', () => {
      // Arrange: step with schemaKey not in ROLE_OUTPUT_SCHEMAS
      // Act + Assert: throws ValidationError
    });
  });
});
```

### Step 4: Verify and commit

```bash
pnpm test:coverage   # all >= 80%
pnpm lint            # zero errors
pnpm typecheck       # zero errors
```

---

## Testing Plan

- **Unit tests**: New tests targeting uncovered branches in domain, orchestrator, persistence
- **Integration tests**: If any tool-level paths are uncovered, add tool execution tests
- **Contract tests**: N/A (schemas already well tested)

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Tests written and passing
- [ ] Coverage meets threshold (>= 80% all dimensions)
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [ ] PR created and linked
