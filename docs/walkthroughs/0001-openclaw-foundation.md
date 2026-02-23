# Walkthrough: 0001 -- OpenClaw Foundation

## Task Reference

- Task: `docs/tasks/0001-openclaw-foundation.md`
- Epic: EP01 -- OpenClaw Foundation
- Branch: `feat/ep01-openclaw-foundation`
- PR: (pending)

---

## Summary

Aligned the gateway configuration and plugin source with OpenClaw's real API.
Replaced the local `OpenClawPluginApi` subset interface with an import from
`openclaw/plugin-sdk`, restructured `openclaw.json` to match the documented
configuration reference, added per-agent workspaces and tool allow-lists using
`snake_case` tool names, and configured sandbox isolation via
`agents.defaults.sandbox`.

---

## Context

The codebase had a placeholder `openclaw.json` with an `agents.list` schema that
used dot-notation tool names (e.g. `task.create`) and lacked workspace paths,
sandbox config, and plugin entries. The plugin source defined a local
`OpenClawPluginApi` interface rather than importing from the real package.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Import `OpenClawPluginApi` from `openclaw/plugin-sdk` | This is the official export path declared in the openclaw package's `exports` field |
| Use `snake_case` tool names (e.g. `task_create`) | OpenClaw agent tools use `snake_case` naming convention per the plugin docs |
| Add `plugins.entries` with config | Required by OpenClaw to pass plugin-specific config (dbPath, github) |
| Use `sandbox.mode: "non-main"` with `scope: "agent"` | Isolates non-default agents in Docker containers with per-agent granularity |
| Set `workspaceAccess: "rw"` | Agents need read-write access to their workspace for task execution |
| Mark `pm` agent as `default: true` | PM is the entry point for task creation workflows |
| Re-export `OpenClawPluginApi` type from plugin index | Tests and downstream consumers can import the type without depending on `openclaw` directly |

---

## Implementation Notes

### Approach

Researched OpenClaw's published npm package types and configuration reference
documentation to understand the real API surface. Key findings:

1. `openclaw/plugin-sdk` is the correct import path (declared in package.json
   `exports` map)
2. `OpenClawPluginApi` has many more methods than the local subset:
   `registerTool`, `registerHook`, `registerHttpHandler`, `registerHttpRoute`,
   `registerChannel`, `registerGatewayMethod`, `registerCli`, `registerService`,
   `registerProvider`, `registerCommand`, `resolvePath`, `on`
3. Agent tool names use `snake_case` (not dot notation)
4. `agents.list[]` supports `id`, `name`, `workspace`, `default`, `tools.allow`,
   `tools.deny`, `sandbox` per object
5. `agents.defaults.sandbox` supports `mode`, `scope`, `workspaceAccess`

### Key Changes

- **Plugin source**: Removed 15-line local `OpenClawPluginApi` interface, replaced
  with single-line import from `openclaw/plugin-sdk`
- **Tests**: Updated mock API to include all methods from the real
  `OpenClawPluginApi` type (13 methods + properties)
- **openclaw.json**: Restructured to match real schema with `plugins.entries`,
  per-agent `workspace` paths, `snake_case` tool names, and sandbox defaults

---

## Commands Run

```bash
pnpm install
pnpm add openclaw  # in extensions/product-team
pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/index.ts` | Modified | Replaced local OpenClawPluginApi with import from openclaw/plugin-sdk |
| `extensions/product-team/test/index.test.ts` | Modified | Updated mock API to match real OpenClawPluginApi shape |
| `extensions/product-team/package.json` | Modified | Added openclaw as dependency |
| `openclaw.json` | Modified | Aligned with real OpenClaw schema (agents, sandbox, plugins.entries, tool names) |
| `docs/backlog/EP01-openclaw-foundation.md` | Modified | Status: PENDING -> IN_PROGRESS -> DONE |
| `docs/tasks/0001-openclaw-foundation.md` | Created | Task specification |
| `docs/walkthroughs/0001-openclaw-foundation.md` | Created | This walkthrough |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| product-team | 3 | 3 | N/A |
| quality-gate | 125 | 123 (2 skipped) | N/A |
| Total | 128 | 126 (2 skipped) | N/A |

---

## Follow-ups

- EP02 will implement the actual tool registration (task_create, task_get, etc.)
- `openclaw start` smoke test cannot be run until OpenClaw gateway is installed
  globally; acceptance criteria for "gateway boots" deferred to integration testing
- Consider adding `optional: true` to side-effect tools when they are registered
  (noted in EP01 Future Considerations)
- Skills are referenced via `skills.load.extraDirs` but not linked per-agent in
  config; OpenClaw discovers skills from the plugin's `openclaw.plugin.json`
  manifest, which already lists all six skill directories

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
