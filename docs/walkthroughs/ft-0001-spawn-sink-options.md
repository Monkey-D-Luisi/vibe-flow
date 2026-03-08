# Walkthrough: FT-0001 -- Fix sharedSpawnSink Dropped Options

## Task Reference

- Task: `docs/tasks/ft-0001-spawn-sink-options.md`
- Branch: `fix/ft-spawn-sink-options`

---

## Summary

Fixed a critical bug where `sharedSpawnSink` in the product-team extension silently dropped `AgentSpawnOptions`, breaking multi-hop agent message delivery via Telegram and other external channels.

---

## Context

When an agent sends a `team_message`, the auto-spawn hooks build delivery routing options (channel, session key, Telegram chat ID) and pass them to `AgentSpawnSink.spawnAgent()`. However, the `sharedSpawnSink` implementation in `index.ts` did not declare or forward the `options` parameter, causing all delivery metadata to be silently lost.

### Symptoms

- PM sends multi-hop message (PM → Tech Lead → Back-1)
- First agent spawns and processes the message
- Reply is stored in the database correctly
- But the spawned agent runs on `agent:<id>:main` session (default) instead of the channel-specific session
- The reply never routes back to the originating Telegram chat

---

## Fix

Two-line change in `extensions/product-team/src/index.ts`:

1. Import `AgentSpawnOptions` type
2. Add `options` parameter to `sharedSpawnSink.spawnAgent` and pass it to `fireAgentViaGatewayWs`

---

## Commands Run

```bash
pnpm typecheck  # Clean
pnpm lint       # Clean
pnpm test       # 892 passed (product-team)
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/index.ts` | Modified | Forward `options` from spawn sink to gateway WS |

---

## Checklist

- [x] Root cause identified
- [x] Fix applied
- [x] Quality gates passed
- [x] Walkthrough written
