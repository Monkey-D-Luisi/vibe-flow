# Task: 0032 -- Extension Scaffolding CLI for New OpenClaw Plugins

## Metadata

| Field | Value |
|-------|-------|
| Status | PENDING |
| Epic | EP07 — DX & Platform Ops |
| Priority | MEDIUM |
| Scope | MAJOR |
| Created | 2026-03-01 |
| Branch | `feat/0032-extension-scaffolding-cli` |
| Source Issue | GitHub #156 |

---

## Goal

Create a CLI generator that scaffolds new OpenClaw extension packages with the correct
directory structure, TypeScript config, ESLint setup, Vitest config, and package.json
boilerplate — enabling developers to bootstrap a new plugin in under a minute.

---

## Context

Currently, creating a new OpenClaw extension requires manually copying and adapting
boilerplate from existing packages. There is no automated generator. This leads to
drift between extension packages in tsconfig settings, lint rules, test setup, and
naming conventions.

Relates to GitHub issue #156 (`docs/backlog/open-issues-intake.md`). Depends on AR01
(DONE) which established the stable baseline conventions used as the scaffold template.

---

## Scope

### In Scope

- CLI command (`pnpm create:extension <name>`) generating a new package under `extensions/<name>/`
- Generated scaffold: `package.json`, `tsconfig.json`, `.eslintrc.cjs`, `vitest.config.ts`, `src/index.ts`, `test/index.test.ts`, `README.md`
- Unit tests covering generator logic and name validation
- Integration test verifying the generated scaffold compiles cleanly

### Out of Scope

- OpenClaw gateway registration for the new extension (separate task)
- CI/CD publish pipeline (Task 0033)
- Scaffolding for `skills/` packages (different structure)

---

## Requirements

1. Generator must accept a `<name>` argument and validate it is a kebab-case extension name (e.g. `my-plugin`). Validation: lowercase letters, digits, and hyphens only; no leading/trailing hyphens; no reserved names (e.g. `node_modules`, `src`).
2. All generated files must conform to current project conventions (ESM, TypeScript strict, Vitest).
3. Generator must refuse to overwrite an existing directory without `--force` flag.
4. The generation action must be idempotent when `--force` is used.
5. Tests must cover happy path, name validation error, and overwrite guard.

---

## Acceptance Criteria

- [ ] AC1: `pnpm create:extension my-plugin` creates `extensions/my-plugin/` with all required files.
- [ ] AC2: Generated `package.json` uses correct scope (`@openclaw/my-plugin`) and ESM settings.
- [ ] AC3: `pnpm typecheck` passes in the generated extension without modification.
- [ ] AC4: Running on an existing dir without `--force` exits non-zero with a descriptive message.
- [ ] AC5: Unit tests cover generator, name validation, and overwrite guard (>= 80% coverage).

---

## Constraints

- Must use Node.js built-ins (`fs`, `path`) and existing workspace utilities — no new external generator libraries.
- Must not introduce breaking changes to existing packages.

---

## Implementation Steps

1. Create `tools/create-extension/` package with `src/cli.ts` and `src/generator.ts`.
2. Implement name validation (kebab-case regex + reserved-name check).
3. Implement file generation using template literals for each output file type.
4. Add overwrite guard — fail fast if target dir exists and `--force` not passed.
5. Wire up as `pnpm create:extension` script in root `package.json`.
6. Write unit tests in `tools/create-extension/test/generator.test.ts`.
7. Write integration test that runs the CLI in a temp directory and verifies output compiles.

---

## Testing Plan

- Unit tests: generator functions, name validation, overwrite guard.
- Integration test: spawn the CLI in a tmp dir, verify generated file tree, and that `tsc --noEmit` passes inside the generated package.
- No database or external network calls required.

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

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
