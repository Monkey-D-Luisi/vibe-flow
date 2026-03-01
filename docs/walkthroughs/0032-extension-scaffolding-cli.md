# Walkthrough: 0032 -- Extension Scaffolding CLI for New OpenClaw Plugins

## Task Reference

- Task: `docs/tasks/0032-extension-scaffolding-cli.md`
- Epic: EP07 — DX & Platform Ops
- Branch: `feat/0032-extension-scaffolding-cli`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/195
- Source Issue: GitHub #156

---

## Summary

Created `tools/create-extension/` — a Node.js CLI generator that scaffolds new
OpenClaw extension packages at `extensions/<name>/` with all required boilerplate:
`package.json`, `tsconfig.json`, `.eslintrc.cjs`, `vitest.config.ts`, `src/index.ts`,
`test/index.test.ts`, and `README.md`.

The tool is available via `pnpm create:extension <name>` from the workspace root and
uses only Node.js built-ins (`fs`, `path`) — no external generator libraries.

---

## Context

Prior to this task, new extensions were bootstrapped by manually copying from
`extensions/product-team/` or `extensions/quality-gate/`. AR01 (Tasks 0010–0031)
established stable TypeScript, lint, and test conventions which now serve as the
canonical baseline for the scaffold templates.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Reserved-names checked before pattern validation | `node_modules` contains underscore so it fails the kebab-case regex; checking the reserved set first gives a clearer error message |
| Exported `main(argv)` from `cli.ts` | Makes the entry point testable without spawning a subprocess |
| `tools/*` added to pnpm workspace | Keeps generator code as a proper workspace package so it is linted and type-checked alongside extensions |
| Templates use `openclaw: 2026.2.22-2` (pinned) | Matches the existing extension convention from product-team |

---

## Implementation Notes

### Architecture

```
tools/create-extension/
  src/
    generator.ts   — validateName() + generateExtension() with all render*() helpers
    cli.ts         — argument parsing, calls generateExtension, exits on error
  test/
    generator.test.ts  — 20 unit + integration tests
  package.json / tsconfig.json / .eslintrc.cjs / vitest.config.ts
```

### Validation rules (`validateName`)

1. Reserved-name check first (set lookup): `node_modules`, `src`, `dist`, `test`,
   `tools`, `packages`, `extensions`, `scripts`, `coverage`.
2. Kebab-case pattern: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` — lowercase letters and digits
   separated by single hyphens; no leading/trailing hyphens.

### Overwrite guard

`generateExtension` calls `existsSync(targetDir)` and throws when the directory
already exists and `force` is not set. With `--force`, `mkdirSync` uses `{ recursive: true }`
so existing directories are not deleted — only files are overwritten.

---

## Commands Run

```bash
pnpm install                                          # pick up tools/* workspace
pnpm --filter @openclaw/create-extension test         # 20/20 pass
pnpm --filter @openclaw/create-extension lint         # clean
pnpm --filter @openclaw/create-extension typecheck    # clean
pnpm --filter @openclaw/create-extension test:coverage # 83.89% stmts, 93.75% branches
pnpm test                                             # 423 tests pass (all workspaces)
pnpm lint                                             # clean (all workspaces)
```

Note: `pnpm typecheck` reports pre-existing errors in untracked EP08 files
(`extensions/product-team/src/tools/{decision-engine,pipeline,project-*,team-messaging}.ts`).
These files are untracked (`??`) and pre-date this task. The `tools/create-extension`
package typechecks cleanly in isolation.

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `tools/create-extension/package.json` | Created | Workspace package manifest for `@openclaw/create-extension` |
| `tools/create-extension/tsconfig.json` | Created | TypeScript config matching extension conventions |
| `tools/create-extension/.eslintrc.cjs` | Created | ESLint config matching extension conventions |
| `tools/create-extension/vitest.config.ts` | Created | Vitest config with 80/75/80/80 thresholds |
| `tools/create-extension/src/generator.ts` | Created | `validateName`, `generateExtension`, and 7 template renderers |
| `tools/create-extension/src/cli.ts` | Created | CLI entry: arg parsing, calls generator, exits on error |
| `tools/create-extension/test/generator.test.ts` | Created | 20 unit + integration tests |
| `pnpm-workspace.yaml` | Modified | Added `tools/*` to workspace packages |
| `package.json` | Modified | Added `create:extension` script (`tsx tools/create-extension/src/cli.ts`) |
| `docs/roadmap.md` | Modified | Task 0032 status PENDING → DONE |
| `docs/tasks/0032-extension-scaffolding-cli.md` | Modified | Status → DONE, DoD checked |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| validateName (unit) | 10 | 10 | 100% |
| generateExtension (unit) | 9 | 9 | 100% |
| Integration (file tree) | 1 | 1 | n/a |
| **Total** | **20** | **20** | **83.89% stmts / 93.75% branches** |

---

## Follow-ups

- Consider extending scaffold to support `skills/` package structure
- Add scaffold validation to CI (lint generated output)
- Gateway auto-registration for scaffolded extensions
- Add `cli.ts` unit tests using mocked `process.exit` for CLI coverage

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
