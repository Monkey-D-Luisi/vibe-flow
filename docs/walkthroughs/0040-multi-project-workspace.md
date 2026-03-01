# Walkthrough 0040 -- Multi-Project Workspace Manager

## Summary

Extended the product-team plugin with multi-project workspace support, allowing
agents to register, list, and switch between project workspaces. Three new tools
(`project.list`, `project.switch`, `project.register`) manage a project registry
backed by the `projects` section in `openclaw.docker.json`. On gateway startup
each registered workspace is initialized (git clone or fetch). Switching projects updates only the in-memory `projectConfig.activeProject` field;
wiring this context into quality, VCS, design tools, and task tagging is deferred
follow-up work (see Deferred Items below).

## Changes

- `extensions/product-team/src/tools/project-list.ts`: New tool returning all registered projects with active/inactive status
- `extensions/product-team/src/tools/project-switch.ts`: New tool that changes the active project context in-memory, updating `projectConfig.activeProject`
- `extensions/product-team/src/tools/project-register.ts`: New tool that appends a new project to the in-memory registry with defaults for workspace, stitch, and quality settings
- `extensions/product-team/src/schemas/project.schema.ts`: TypeBox schemas for `project.list`, `project.switch`, and `project.register` parameters
- `extensions/product-team/src/services/workspace-init.ts`: Startup service that iterates registered projects and runs `git clone --depth 1` or `git fetch origin` as needed; validates repo names and workspace paths for shell-safe input before spawning
- `extensions/product-team/src/config/plugin-config.ts`: Added `resolveProjectConfig()` that extracts the `projects` array and `activeProject` field from plugin config with safe defaults
- `extensions/product-team/src/tools/index.ts`: Registered the three new tools (`project.list`, `project.switch`, `project.register`); total tool count updated from 17 to 20
- `extensions/product-team/src/index.ts`: Imported `resolveProjectConfig` and `initializeWorkspaces`; wired `projectConfig` into tool deps; calls `initializeWorkspaces` on startup with a non-blocking catch
- `openclaw.docker.json`: Already contained `projects` array (two entries: `vibe-flow` and `saas-template`) and `activeProject` field from prior setup (D1 delivered as part of task context)
- `extensions/product-team/test/tools/project-tools.test.ts`: Unit tests for all three project tools (8 scenarios)
- `extensions/product-team/test/services/workspace-init.test.ts`: Unit tests for workspace-init (8 scenarios: clone, fetch, failure paths, validation, multi-project)
- `extensions/product-team/test/index.test.ts`: Updated tool count assertions from 17 to 20; added `project.list/switch/register` to expected tool names

## Decisions

- **Per-session project state**: `projectConfig.activeProject` is mutated in-memory on `project.switch`. This is intentional — switching is per-session (one agent's context), not global. Agents running in separate processes each start with the configured `activeProject` from the JSON config.
- **Workspace init is non-blocking**: `initializeWorkspaces` is fire-and-forget at startup (`catch` logs a warning). Git clone/fetch failures do not prevent the gateway from starting.
- **Shell-safe spawning for git**: A dedicated `services/workspace-init.ts` uses `node:child_process.spawn` directly (not `safeSpawn` which only allows `gh`). Repo strings are validated against `/^[\w.-]+\/[\w.-]+$/` and workspace paths against a metacharacter blocklist before any spawn call.

## Deferred Items

The following acceptance criteria from D4 (Tool Context Injection) and D5 (Task Tagging) were not implemented in this task. They require further invasive changes to existing tools and a migration-aware task schema update:

- Quality tools using project-specific thresholds post-switch (would need quality tools to read `deps.projectConfig?.activeProject` project quality overrides)
- VCS tools targeting the active project's `repo` field (currently bound to static `githubConfig.owner/repo`)
- Design tools using active project's Stitch project ID (handled in the `stitch-bridge` extension, not product-team)
- Task tagging with `project` field for `task.search` filtering

These items are tracked as follow-up work for a subsequent task.

## Verification

- typecheck: PASS
- lint: PASS
- tests: PASS (419 tests — 16 new, 403 pre-existing)
