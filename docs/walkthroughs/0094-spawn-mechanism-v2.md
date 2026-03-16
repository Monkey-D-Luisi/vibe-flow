# Walkthrough: 0094 -- Spawn Mechanism v2 -- Zero SDK Internals

## Task Reference

- Task: `docs/tasks/0094-spawn-mechanism-v2.md`
- Epic: EP13 -- Stable Agent Protocol
- Branch: `feat/0094-spawn-mechanism-v2`
- PR: [#256](https://github.com/Monkey-D-Luisi/vibe-flow/pull/256)

---

## Summary

Replaced the spawn mechanism's dependency on minified SDK internals (`clientMod.*` prototype-shape discovery) with a lightweight raw WebSocket client that speaks the gateway JSON-RPC protocol directly. Wired the existing `SpawnService` retry queue into production, bounded the dedup Map, removed hardcoded `/app` paths, and added a feature flag for rollback.

---

## Context

The spawn mechanism (`fireAgentViaGatewayWs` in `auto-spawn.ts`) scanned `/app/node_modules/openclaw/dist/` for `client-*.js`, dynamically imported the minified bundle, and discovered `GatewayClient` by prototype shape inspection (`sendConnect`, `request`, `start` methods). This broke on SDK updates and was fundamentally fragile.

Key discovery: `GatewayClient` is NOT exported at runtime from `openclaw/plugin-sdk` — only type declarations exist (`.d.ts` files without corresponding `.js`). The actual code lives in hashed bundles like `client-CuIxivDk.js`. A public import approach was therefore not viable.

The gateway uses a simple JSON-RPC-over-WebSocket protocol that can be spoken directly with ~80 lines of raw WebSocket code, eliminating the entire SDK dependency.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Raw WebSocket instead of SDK import | `GatewayClient` is not exported at runtime; only `.d.ts` declarations exist. Raw WS is the cleanest zero-dependency approach |
| Keep subprocess approach | Config state isolation — `GatewayClient` constructor triggers `loadConfig()` which resets Telegram bindings |
| Wire SpawnService in production | Unlocks retry queue + dead-letter semantics that were built (EP09 task 0067) but unused |
| Feature flag for rollback | Safety net; `OPENCLAW_SPAWN_V1=1` reverts to legacy SDK-discovery code path |
| Env-driven paths (v2 only) | `OPENCLAW_APP_DIR` and `OPENCLAW_SPAWN_LOG_DIR` replace hardcoded `/app` and `/tmp/openclaw` in v2. The v1 legacy path is intentionally frozen with hardcoded paths — it will be removed after v2 production validation |

---

## Implementation Notes

### Approach

Reverse-engineered the gateway WebSocket protocol from the minified SDK bundle:

1. WS opens → server sends `connect.challenge` event with nonce
2. Client sends `req` frame: `{ type: "req", id: "<uuid>", method: "connect", params: { auth, client, scopes, ... } }`
3. Server responds with `{ id, ok: true }`
4. Client sends `req` frame: `{ type: "req", id: "<uuid>", method: "agent", params: { sessionKey, message, idempotencyKey, ... } }` (no `agentId` — gateway resolves agent config from sessionKey via loadSessionEntry)
5. Server responds with `{ id, ok: true, payload }` → done

### Key Changes

1. **`buildAgentParams()`** — Extracted helper that JSON-serializes agent request parameters with proper escaping
2. **`buildRawWsSpawnScript()`** — Generates ~80-line ESM script with raw `WebSocket` (Node.js built-in), zero SDK deps. Includes timeout, error handling, and structured logging
3. **`fireAgentViaGatewayWs()` rewrite** — v2 uses raw WS script, env-driven paths (`OPENCLAW_APP_DIR`, `OPENCLAW_SPAWN_LOG_DIR`), no `NODE_PATH`
4. **`fireAgentViaGatewayWsV1()`** — Legacy SDK-discovery spawn preserved verbatim for rollback
5. **`dispatchAgentSpawn()`** — Feature flag dispatch: `OPENCLAW_SPAWN_V1=1` → v1, else → v2
6. **SpawnService wiring** — `index.ts` now instantiates `SpawnService` with `dispatchAgentSpawn` as `primarySpawner`, replacing the inline `sharedSpawnSink`
7. **Dedup Map bounded** — `DEDUP_MAX_SIZE = 1000` with oldest-first eviction in `isDuplicate()`
8. **Child process error handlers** — Both v1 and v2 now attach `child.on('error', ...)` to prevent unhandled ENOENT on Windows

---

## Commands Run

```bash
pnpm test    # 1147 tests passed, 0 failed
pnpm lint    # 0 errors
pnpm typecheck  # 0 errors
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/hooks/auto-spawn.ts` | Modified | Raw WS spawn v2, v1 legacy fallback, `dispatchAgentSpawn`, `buildAgentParams`, `buildRawWsSpawnScript`, dedup bounding, error handlers |
| `extensions/product-team/src/index.ts` | Modified | Replaced inline `sharedSpawnSink` with `SpawnService` + `dispatchAgentSpawn` |
| `extensions/product-team/test/hooks/auto-spawn.test.ts` | Modified | Added tests for `buildAgentParams`, `buildRawWsSpawnScript`, `dispatchAgentSpawn`, dedup bounding |
| `docs/tasks/0094-spawn-mechanism-v2.md` | Created | Task specification |
| `docs/walkthroughs/0094-spawn-mechanism-v2.md` | Created | This walkthrough |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| auto-spawn.test.ts | 85 | 85 | New: buildAgentParams (5), buildRawWsSpawnScript (11), dispatchAgentSpawn (3), dedup bounding (2) |
| spawn-service.test.ts | 7 | 7 | Existing, unchanged |
| All suites | 1147 | 1147 | Full pass |

---

## Follow-ups

- Remove v1 legacy path after production validation (delete `fireAgentViaGatewayWsV1` and `OPENCLAW_SPAWN_V1` flag)
- Consider promoting `buildRawWsSpawnScript` to a shared utility if other extensions need gateway communication
- Monitor retry queue / dead-letter metrics in production

---

## Checklist

- [x] Task spec read end-to-end
- [x] All ACs verified (AC1-AC7)
- [x] Quality gates passed (lint, typecheck, test)
- [x] Files changed section complete
- [x] Follow-ups recorded
