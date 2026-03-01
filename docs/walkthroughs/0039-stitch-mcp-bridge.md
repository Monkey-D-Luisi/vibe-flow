# Walkthrough 0039 -- Stitch MCP Bridge Plugin

## Goal (restated)
Create an OpenClaw plugin that proxies Google Stitch MCP design tools for the
designer agent to generate, edit, and retrieve UI screen designs.

## Decisions
- **HTTP JSON-RPC client extracted to `src/stitch-client.ts`**: Separates the
  transport layer from plugin registration for independent testability.
- **Retry with exponential backoff**: 3 attempts, 500ms base (500ms, 1s)
  for HTTP 5xx and transient network errors. 4xx errors fail immediately.
- **Local file storage**: Designs saved to `<workspace>/.stitch-html/<name>.html`
  matching the saas-template convention.
- **API key from env**: `STITCH_API_KEY` read from environment variable.
- **Config from openclaw.plugin.json**: Endpoint, project ID, model, timeout,
  and design directory all configurable per deployment.

## Files Created / Modified
- `extensions/stitch-bridge/src/stitch-client.ts` — Extracted Stitch MCP HTTP
  client with retry logic (3 attempts, exponential backoff on 5xx/network errors)
- `extensions/stitch-bridge/src/index.ts` — Updated to import from
  `stitch-client.ts` (removed inline implementation)
- `extensions/stitch-bridge/test/stitch-client.test.ts` — 8 unit tests covering
  success, header validation, missing API key, 4xx (no retry), RPC error, 5xx
  retry (success on 2nd attempt), network error retry (success on 3rd), exhausted
  retries
- `extensions/stitch-bridge/test/tools/design-generate.test.ts` — 4 unit tests
  for the `design.generate` tool: full flow, config defaults, content format,
  error propagation

## Commands Run
```bash
pnpm test          # 12 tests pass (2 test files)
pnpm lint          # clean
pnpm typecheck     # clean
```

## Test Results
- `test/stitch-client.test.ts`: 8/8 pass
- `test/tools/design-generate.test.ts`: 4/4 pass
- Root-level: 403 tests pass (no regressions)

## Trade-offs
- `workspace` parameter still defaults to `/workspaces/active`. Will be properly
  injected by the multi-project workspace manager (Task 0040).
- Tests mock `callStitchMcp` in design-generate tests to keep them fast and isolated.
- Retry delay is controlled via fake timers in tests to avoid slow test execution.

## Follow-ups
- Wire workspace parameter to active project context (Task 0040)
- Add design caching to avoid re-fetching unchanged designs
- Add `design.edit` and `design.list` tool-level tests (currently covered by index integration)
