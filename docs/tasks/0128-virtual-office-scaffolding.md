# Task 0128 -- Virtual Office Extension Scaffolding + Static File Server

**Epic:** EP20 -- Virtual Office
**Scope:** MINOR
**Status:** DONE
**Assignee:** back-1

## Objective

Create `extensions/virtual-office/` with monorepo-standard scaffolding and a working HTTP prefix route that serves static files at `/office`.

## Deliverables

1. `extensions/virtual-office/package.json` -- standard monorepo extension package
2. `extensions/virtual-office/tsconfig.json` -- ES2022/NodeNext/strict
3. `extensions/virtual-office/vitest.config.ts` -- test configuration
4. `extensions/virtual-office/src/index.ts` -- extension entry with HTTP route registration
5. `extensions/virtual-office/src/http/static-server.ts` -- static file serving with MIME types and path traversal prevention
6. `extensions/virtual-office/src/public/index.html` -- placeholder page
7. `extensions/virtual-office/src/public/office.ts` -- minimal esbuild entrypoint
8. Update `openclaw.json` + `openclaw.docker.json` to load virtual-office
9. Tests for static server

## Acceptance Criteria

- `pnpm install && pnpm --filter @openclaw/virtual-office typecheck` passes
- GET `/office` returns HTML page
- GET `/office/office.js` returns bundled JS with correct content-type
- GET `/office/../secret` returns 404 (path traversal blocked)
- All tests pass
