# Walkthrough: 0032 -- Extension Scaffolding CLI for New OpenClaw Plugins

## Task Reference

- Task: `docs/tasks/0032-extension-scaffolding-cli.md`
- Epic: EP07 — DX & Platform Ops
- Branch: `feat/0032-extension-scaffolding-cli`
- PR: _pending_
- Source Issue: GitHub #156

---

## Summary

_Pending implementation. Task spec activated from open-issues-intake.md on 2026-03-01._

This task will create a CLI generator (`pnpm create:extension <name>`) that scaffolds
new OpenClaw extension packages with all required boilerplate — removing manual copying
and preventing convention drift across extensions.

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
| Node.js built-ins only (no Plop/Yeoman) | Avoids new external generator dependencies; project already uses custom tooling |
| `tools/create-extension/` package | Keeps generator code separate from extension runtime code |
| `--force` flag for overwrite | Explicit opt-in prevents accidental overwrites without blocking re-generation use cases |

---

## Implementation Notes

### Approach

_To be completed during implementation._

### Key Changes

_To be completed during implementation._

---

## Commands Run

```bash
# To be filled during implementation
pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `tools/create-extension/src/cli.ts` | Created | CLI entry point |
| `tools/create-extension/src/generator.ts` | Created | Core generator logic |
| `tools/create-extension/src/__tests__/generator.test.ts` | Created | Unit tests |
| `package.json` | Modified | Add `create:extension` script |

_Exact file list to be updated during implementation._

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| Unit | - | - | - |
| Integration | - | - | - |
| Total | - | - | - |

_To be filled during implementation._

---

## Follow-ups

- Consider extending scaffold to support `skills/` package structure
- Add scaffold validation to CI (lint generated output)
- Gateway auto-registration for scaffolded extensions

---

## Checklist

- [ ] Task spec read end-to-end
- [ ] TDD cycle followed (Red-Green-Refactor)
- [ ] All ACs verified
- [ ] Quality gates passed
- [ ] Files changed section complete
- [ ] Follow-ups recorded
