# Task: 0120 -- Extension Scaffolding Templates by Type

## Metadata

| Field | Value |
|-------|-------|
| Status | IN_PROGRESS |
| Epic | EP18 -- Plugin SDK Contracts & DX |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-29 |
| Branch | `feat/EP18-plugin-sdk-contracts-dx` |

---

## Goal

Enhance the `create:extension` CLI with a `--template` flag supporting 5
template types: tool, hook, service, http, and hybrid.

---

## Context

The current scaffolding CLI generates a single generic template with an outdated
`Plugin` type pattern (`{ name, version, tools: [] }`). Real extensions use the
`export default { id, name, description, register(api) }` pattern. This task
updates the generator to produce modern, pattern-specific scaffolds.

---

## Scope

### In Scope

- Add --template flag to CLI (tool, hook, service, http, hybrid)
- Each template generates idiomatic src/index.ts and test/index.test.ts
- Update generated code to use modern register(api) pattern
- Tests for all 5 template types

### Out of Scope

- File-based templates (templates are rendered from functions, not template files)

---

## Acceptance Criteria

- [ ] AC1: All 5 template types scaffold correctly
- [ ] AC2: Scaffolded code uses modern register(api) pattern
- [ ] AC3: --template flag with help text
- [ ] AC4: >= 80% test coverage for scaffolding logic
- [ ] AC5: Default template (no flag) produces hybrid

---

## Definition of Done

- [ ] CLI accepts --template flag with 5 types
- [ ] Each template generates correct, idiomatic code
- [ ] Tests cover all templates and edge cases
- [ ] pnpm test && pnpm lint && pnpm typecheck passes
