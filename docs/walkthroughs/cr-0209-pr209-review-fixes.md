# Walkthrough CR-0209 — PR #209 Review Fixes

## Summary

Addressed 16 review comments (Gemini + Copilot) on PR #209 (`feat/task-0047-config-web-ui`).
Fixed 5 MUST_FIX items (XSS, unsafe config cast, hard-coded ws://, zero tests, 404 nav links)
and 8 SHOULD_FIX items (silent errors, method restriction, doc/walkthrough inaccuracies,
acceptance criteria alignment, basePath factory).

## Changes

- `extensions/team-ui/src/index.ts`: Safe pluginConfig handling, method restriction on HTTP handler, protocol-aware WebSocket URL, XSS-safe DOM rendering, hash-based nav links, console.error on load failures
- `extensions/team-ui/src/handlers/config-handlers.ts`: Factory pattern for config.get handler with basePath closure
- `extensions/team-ui/src/static/index.html`: Nav links changed to hash-based
- `extensions/team-ui/vitest.config.ts`: Changed `passWithNoTests` from true to false
- `extensions/team-ui/test/plugin.test.ts`: 8 tests covering plugin registration, config handling, HTTP handler
- `extensions/team-ui/test/handlers.test.ts`: 12 tests covering all handler modules
- `docs/tasks/0047-config-web-ui.md`: Updated acceptance criteria (checked delivered, marked deferred), fixed `registerHttpHandler` → `registerHttpRoute`
- `docs/walkthroughs/0047-config-web-ui.md`: Fixed API name references, manifest description, tsconfig description

## Verification

```bash
pnpm typecheck      # PASS
pnpm lint           # PASS
pnpm test           # PASS (20 new team-ui tests)
```

## Commands Run

```bash
# Edit source files
# Create test files
pnpm --filter @openclaw/plugin-team-ui typecheck
pnpm --filter @openclaw/plugin-team-ui lint
pnpm --filter @openclaw/plugin-team-ui test
pnpm typecheck
pnpm lint
pnpm test
git add ...
git commit
git push
```
