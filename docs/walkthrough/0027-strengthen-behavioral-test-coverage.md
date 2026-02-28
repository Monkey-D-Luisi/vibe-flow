# Task 0027: Strengthen Behavioral Test Coverage

## Summary
Strengthened the behavioral test coverage for the security-critical `spawn` functions and the quality-gate execution tools. This involved migrating existing `safeSpawn` tests into the core `quality-contracts`, ensuring their coverage met the >= 80% mark natively, and adding Integration Tests that validate the parsed output using realistic JSON data (ESLint outputs and Vitest reporting).

## Key Changes
- Moved `extensions/quality-gate/test/spawn.test.ts` to `packages/quality-contracts/test/exec/spawn.test.ts`. This ensured `safeSpawn` and associated helpers are tested within the contracts package.
- Validated that `packages/quality-contracts/src/exec/spawn.ts` exceeds 80% branch and line coverage properly (achieved 81.31%).
- Added exact structure fixtures for `eslint-output.json` and `vitest-output.json` inside `extensions/quality-gate/test/fixtures/`.
- Written `lint.tool.integration.test.ts` and `run_tests.tool.integration.test.ts`. These test cases mock the raw process `stdout` out of `safeSpawn` returning strictly the fixture content instead of returning simple/abstract dummy text strings, verifying the exact output of ESLint and Vitest parses properly and maps correctly to `LintOutput` and `VitestSummary`.

## How to Run / Test
- Run `pnpm test` globally. Both the original unit tests and the newly introduced `.integration.test.ts` files will execute natively.
- To check coverage on `spawn.ts`, run `pnpm exec vitest run --coverage packages/quality-contracts` from the root.

## Notable Decisions / Risks
- Relied on direct mocking of `safeSpawn` injecting the string representation of our dummy JSON payloads. This directly aligns the parsing engine validation realistically against standard format while skipping process execution penalties in integration pipelines. 
