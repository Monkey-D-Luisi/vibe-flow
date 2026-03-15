# Task: 0094 -- Spawn Mechanism v2 -- Zero SDK Internals

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP13 -- Stable Agent Protocol |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-15 |
| Branch | `feat/0094-spawn-mechanism-v2` |

---

## Goal

Replace the spawn mechanism's dependency on minified SDK internals with a lightweight raw WebSocket client that speaks the gateway protocol directly, eliminating all SDK bundle dependencies. Wire the existing `SpawnService` retry queue into production.

---

## Context

The current `fireAgentViaGatewayWs` function in `auto-spawn.ts` spawns a detached subprocess that scans `/app/node_modules/openclaw/dist/` for `client-*.js`, dynamically imports the minified bundle, and discovers `GatewayClient` by prototype shape inspection. This is fragile and breaks on SDK updates.

EP09 task 0067 created a `SpawnService` with retry queue and dead-letter semantics, but it was never wired into production -- `index.ts` uses an inline wrapper instead.

Key finding: `GatewayClient` is NOT exported at runtime from `openclaw/plugin-sdk` — only type declarations exist. The gateway uses a simple JSON-RPC-over-WebSocket protocol: challenge→connect→request. A raw WS client with ~60 lines replaces the entire SDK dependency.

---

## Scope

### In Scope

- Rewrite spawn transport to use raw WebSocket (zero SDK imports)
- Wire `SpawnService` into production (`index.ts`)
- Feature flag (`OPENCLAW_SPAWN_V1`) for rollback
- Fix hardcoded `/app` paths
- Bound the `recentSpawns` dedup Map

### Out of Scope

- In-process spawning (subprocess kept for config isolation)
- Changes to auto-spawn hook logic (trigger conditions unchanged)
- Changes to `AgentSpawnSink` interface

---

## Requirements

1. Zero references to minified SDK exports (`clientMod.*` discovery) or SDK dist bundles
2. Raw WebSocket client speaks gateway JSON-RPC protocol directly (challenge→connect→request)
3. Document the `agent` method params contract
4. SpawnService retry queue and dead-letter semantics active in production
5. Feature flag `OPENCLAW_SPAWN_V1=1` reverts to old implementation
6. No hardcoded `/app` filesystem paths

---

## Acceptance Criteria

- [x] AC1: Zero references to minified SDK exports or dist bundles in spawn code
- [x] AC2: Spawn uses raw WebSocket with gateway JSON-RPC protocol
- [x] AC3: SpawnService wired in production (retry queue + dead letter active)
- [x] AC4: `OPENCLAW_SPAWN_V1=1` env var reverts to old spawn implementation
- [x] AC5: No hardcoded `/app` paths in spawn code
- [x] AC6: `recentSpawns` dedup Map bounded (max 1000 entries)
- [x] AC7: >= 90% test coverage on modified code

---

## Constraints

- Subprocess approach preserved for config state isolation
- `AgentSpawnSink` interface unchanged (backward compatible)
- Retry queue and dead-letter semantics from EP09 preserved
- No breaking changes to auto-spawn hook trigger logic

---

## Implementation Steps

1. Rewrite `fireAgentViaGatewayWs` inline script with raw WebSocket client
2. Replace hardcoded `/app` paths with dynamic resolution
3. Add `OPENCLAW_SPAWN_V1` feature flag with conditional path
4. Bound `recentSpawns` Map with max-size eviction
5. Wire `SpawnService` into `index.ts` replacing inline `sharedSpawnSink`
6. Update/create tests for new spawn path
7. Run quality gates

---

## Testing Plan

- Unit tests: SpawnService wiring, feature flag switching, dedup map bounds
- Integration tests: spawn function generates correct subprocess script with public import
- Contract tests: verify spawn params match `AgentParamsSchema`

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 90%)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md)
- [Coding Standards](../../.agent/rules/coding-standards.md)
- [Testing Standards](../../.agent/rules/testing-standards.md)
- [EP13 Backlog](../backlog/EP13-stable-agent-protocol.md)
