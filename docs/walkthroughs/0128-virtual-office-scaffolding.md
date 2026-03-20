# Walkthrough 0128 -- Virtual Office Extension Scaffolding

## Summary

Created `extensions/virtual-office/` -- a new OpenClaw extension that serves a pixel-art virtual office at `/office` via HTTP prefix routing. This is the foundation for EP20 (Virtual Office), which will visualize the 8 AI agents in real-time.

## What was built

### Extension scaffolding

Standard monorepo extension with:
- `package.json` -- `@openclaw/virtual-office`, ESM, openclaw 2026.3.2 dep, esbuild devDep
- `tsconfig.json` -- ES2022/NodeNext/strict, excludes `src/public/` (frontend is bundled separately by esbuild)
- `vitest.config.ts` -- passWithNoTests, 50% coverage thresholds, excludes frontend code

### Static file server (`src/http/static-server.ts`)

HTTP handler that serves files from `dist/public/`:
- MIME type detection for html, js, css, json, png, jpg, svg, ico, woff2
- Path traversal prevention (validates resolved path stays within baseDir)
- HEAD request support
- 405 for non-GET/HEAD methods
- 404 for missing files

### Extension entry (`src/index.ts`)

Registers `/office` as a prefix HTTP route with `auth: 'plugin'` (no gateway auth required). TODO placeholders for lifecycle hooks and gateway WebSocket methods (tasks 0131+).

### Frontend placeholder (`src/public/`)

- `index.html` -- loading screen with pixel-art aesthetic (dark theme, monospace font)
- `office.ts` -- Canvas 2D placeholder rendering: 20x12 tile grid with 8 colored agent squares at desk positions, labels (PM, TL, PO, DSG, BE, FE, QA, DO)

### Gateway configuration

Added virtual-office to plugin load paths in both `openclaw.json` (local dev) and `openclaw.docker.json` (Docker deployment).

## Tests

9 tests in `test/static-server.test.ts`:
- Serves index.html for `/office` and `/office/`
- Correct content-type for .js, .css files
- 404 for missing files
- Path traversal blocked (`../../../etc/passwd`, `%2e%2e` encoded)
- 405 for POST requests
- HEAD requests return headers without body

## Verification

```bash
pnpm --filter @openclaw/virtual-office typecheck  # passes
pnpm --filter @openclaw/virtual-office lint        # passes
pnpm --filter @openclaw/virtual-office test        # 9 tests pass
pnpm --filter @openclaw/virtual-office build:frontend  # 2.6kb bundle
```

## Files created

| File | LOC | Purpose |
|------|-----|---------|
| `extensions/virtual-office/package.json` | 34 | Package manifest |
| `extensions/virtual-office/tsconfig.json` | 20 | TypeScript config (excludes src/public/) |
| `extensions/virtual-office/vitest.config.ts` | 18 | Test config |
| `extensions/virtual-office/src/index.ts` | 44 | Extension entry + HTTP route registration |
| `extensions/virtual-office/src/http/static-server.ts` | 92 | Static file serving with security |
| `extensions/virtual-office/src/public/index.html` | 45 | HTML page |
| `extensions/virtual-office/src/public/office.ts` | 100 | Canvas 2D placeholder |
| `extensions/virtual-office/test/static-server.test.ts` | 130 | 9 tests |
| `docs/backlog/EP20-virtual-office.md` | 40 | Epic backlog |
| `docs/tasks/0128-virtual-office-scaffolding.md` | 30 | Task spec |

## Files modified

| File | Change |
|------|--------|
| `openclaw.json` | Added `./extensions/virtual-office` to plugins.load.paths |
| `openclaw.docker.json` | Added `/app/extensions/virtual-office` to paths + enabled entry |

## Architecture decisions

1. **Frontend excluded from tsc** -- `src/public/` uses DOM APIs (Canvas, document, window) which need `lib: ["DOM"]`. Rather than adding DOM to the server-side tsconfig, we exclude the frontend and bundle it separately with esbuild. This keeps the server-side TS clean (NodeNext only).

2. **`auth: 'plugin'`** -- The `/office` route bypasses gateway token auth so the dashboard is accessible directly in a browser without credentials. This matches the pattern used by the `/health` endpoint.

3. **`match: 'prefix'`** -- All requests under `/office/*` route to our handler. The SDK type `OpenClawPluginHttpRouteMatch` supports `'exact' | 'prefix'`.

## Next steps

- **Task 0129**: Canvas engine core (game loop, tile map, renderer, characters FSM)
- **Task 0131**: WebSocket bridge (lifecycle hooks -> broadcast -> frontend client)
