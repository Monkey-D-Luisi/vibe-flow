# Task: 0118 -- Plugin API Reference Documentation

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP18 -- Plugin SDK Contracts & DX |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-29 |
| Branch | `feat/EP18-plugin-sdk-contracts-dx` |

---

## Goal

Create comprehensive API reference documentation for the OpenClaw plugin
extension API, derived from the actual implementations across all six extensions.

---

## Context

The plugin API surface is implicit — learned by reading `index.ts` files across
extensions. For external contributors, there is no API reference, no working
examples, and no structured documentation of the `OpenClawPluginApi` interface.

Existing documentation (`docs/api-reference.md`) covers product-team tool
listings only, not the plugin API itself.

---

## Scope

### In Scope

- Document all public API methods on the `api` object
- One markdown file per API area under `docs/api/`
- Function signatures, parameter tables, return types, executable examples
- Cross-references to real usage in existing extensions

### Out of Scope

- Auto-generated API docs from source (e.g., TypeDoc)
- Changes to existing extension runtime code

---

## Requirements

1. All public API methods documented with full signatures
2. Every method has at least one executable example
3. Cross-referenced to real usage in existing extensions
4. No undocumented public API surfaces remain
5. Examples must be copy-pasteable into a new extension

---

## Acceptance Criteria

- [ ] AC1: `docs/api/README.md` exists with overview and navigation
- [ ] AC2: `docs/api/tools.md` documents `api.registerTool()` with signatures and examples
- [ ] AC3: `docs/api/hooks.md` documents all lifecycle events with handler signatures
- [ ] AC4: `docs/api/http.md` documents `api.registerHttpRoute()` with auth modes
- [ ] AC5: `docs/api/services.md` documents `registerService()` and `registerCommand()`
- [ ] AC6: `docs/api/configuration.md` documents `pluginConfig`, `config`, `logger`, `resolvePath`
- [ ] AC7: `docs/api/examples.md` provides complete mini-extension examples

---

## Testing Plan

- Verify all code examples are syntactically valid TypeScript
- Cross-check documented signatures against actual extension code
- Verify cross-references point to existing files

---

## Definition of Done

- [ ] All 7 docs/api/ files created
- [ ] All public API methods documented
- [ ] Every method has at least one executable example
- [ ] Cross-referenced to real usage in existing extensions
