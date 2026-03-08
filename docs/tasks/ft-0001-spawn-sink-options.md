# Fast Track: FT-0001 -- Fix sharedSpawnSink Dropped Options

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Priority | CRITICAL |
| Scope | MINOR |
| Created | 2026-03-08 |
| Branch | `fix/ft-spawn-sink-options` |

---

## Problem

Multi-hop agent messages (e.g. PM → Tech Lead → Back-1) fail silently. The spawned agent runs but its reply never routes back to the originating channel (e.g. Telegram).

## Root Cause

`sharedSpawnSink` in `extensions/product-team/src/index.ts` (lines 325-334) does not accept or forward the `options` parameter to `fireAgentViaGatewayWs`. The auto-spawn hooks (`handleTeamMessageAutoSpawn`, `handleTeamReplyAutoSpawn`) carefully build `AgentSpawnOptions` with delivery routing metadata (channel, session key, chat ID), but the spawn sink silently discards them.

## Fix

Add the `options?: AgentSpawnOptions` parameter to the `sharedSpawnSink.spawnAgent` signature and forward it to `fireAgentViaGatewayWs`.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/index.ts` | Modified | Added `options` parameter to `sharedSpawnSink.spawnAgent` and forwarded to `fireAgentViaGatewayWs` |
| `docs/tasks/ft-0001-spawn-sink-options.md` | Created | This task spec |
| `docs/walkthroughs/ft-0001-spawn-sink-options.md` | Created | Walkthrough |
