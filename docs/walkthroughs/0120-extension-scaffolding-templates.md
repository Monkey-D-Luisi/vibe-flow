# Walkthrough: 0120 -- Extension Scaffolding Templates by Type

## Task Reference

- Task: `docs/tasks/0120-extension-scaffolding-templates.md`
- Epic: EP18 -- Plugin SDK Contracts & DX
- Branch: `feat/EP18-plugin-sdk-contracts-dx`
- PR: (pending)

---

## Summary

Enhanced the `create:extension` CLI with `--template` flag supporting 5
template types: tool, hook, service, http, and hybrid. Updated all generated
code to use the modern `register(api)` default export pattern.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Template renderers as functions, not template files | Simpler, no file I/O for templates, type-safe |
| hybrid as default template | Backward compatible, most comprehensive scaffold |
| Modern register(api) pattern in all templates | Matches real extensions, replaces outdated Plugin type |

---

## Implementation Notes

### Approach

Refactored `generator.ts` to accept a `template` parameter. Added a
`templates.ts` module with per-template `src/index.ts` and `test/index.test.ts`
renderers. Updated `cli.ts` to parse `--template` flag.

### Key Changes

- `src/cli.ts`: Added `--template` flag parsing with validation
- `src/generator.ts`: Added `template` option, delegates to `templates.ts`
- `src/templates.ts`: New file with 5 template renderers
- `test/generator.test.ts`: Added tests for all 5 template types

---

## Commands Run

```bash
pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `tools/create-extension/src/cli.ts` | Modified | Added --template flag parsing |
| `tools/create-extension/src/generator.ts` | Modified | Added template option, delegates to templates module |
| `tools/create-extension/src/templates.ts` | Created | 5 template renderers (tool, hook, service, http, hybrid) |
| `tools/create-extension/test/generator.test.ts` | Modified | Added tests for all template types |
