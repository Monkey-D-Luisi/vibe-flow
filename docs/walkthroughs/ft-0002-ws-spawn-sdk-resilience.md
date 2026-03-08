# Walkthrough: WS Spawn SDK Resilience

## Problem

Agent auto-spawn via WebSocket (`fireAgentViaGatewayWs`) broke when the
OpenClaw SDK updated from 2026.2.x to 2026.3.2. The inline ESM script
referenced hardcoded minified symbol names (`clientMod.kt` for
`PROTOCOL_VERSION`, `clientMod.Xt` for `loadOrCreateDeviceIdentity`,
`callMod.s`/`callMod.c` for scope constants) which shifted during the
SDK's minification pass.

### Symptoms

1. PM calls `team_message` → hook triggers `fireAgentViaGatewayWs` → subprocess
   launches but gateway rejects with:
   ```
   invalid connect params: must have required property 'minProtocol';
   must have required property 'maxProtocol'; at /scopes
   ```
2. Spawned agents never connect → no `team_inbox` read → no `team_reply` →
   multi-hop messaging appears completely broken.

### Root cause

| Old symbol | What it was | New symbol (2026.3.2) |
|------------|-------------|----------------------|
| `clientMod.kt` | `PROTOCOL_VERSION` (number) | validator function |
| `clientMod.Xt` | `loadOrCreateDeviceIdentity` | `summarizeDeviceTokens` |
| `callMod.s` | `"operator.admin"` | `undefined` |
| `callMod.c` | `"operator.read"` | `"operator.admin"` |

The `GatewayClient` constructor received `minProtocol: <function>` instead
of `minProtocol: <number>`, causing the gateway schema validation to reject
the connect frame.

## Fix

### 1. Removed hardcoded minified symbols

The inline ESM script no longer references any hardcoded minified export
names except finding `GatewayClient` itself. Instead of symbol names, the
script discovers the class by prototype shape:

```js
const GatewayClient = Object.values(clientMod).find(
  v => typeof v === "function" && v.prototype
    && typeof v.prototype.sendConnect === "function"
    && typeof v.prototype.request === "function"
    && typeof v.prototype.start === "function"
);
```

### 2. Leveraged GatewayClient's internal defaults

The `GatewayClient.sendConnect()` method already defaults:
- `minProtocol: this.opts.minProtocol ?? PROTOCOL_VERSION`
- `maxProtocol: this.opts.maxProtocol ?? PROTOCOL_VERSION`
- `scopes: this.opts.scopes ?? ["operator.admin"]`
- Constructor: `deviceIdentity: opts.deviceIdentity ?? loadOrCreateDeviceIdentity()`

By omitting these from the constructor options, the class uses its own
module-level constants — which always match the SDK version.

### 3. Added multi-hop messaging integration tests

New test file: `test/integration/multi-hop-messaging.test.ts` (7 tests)

| Scenario | What it validates |
|----------|------------------|
| PM → TL round-trip | Full send → spawn → inbox → reply → spawn → inbox cycle |
| PM → TL → Back-1 → TL → PM | 3-hop relay with origin preservation |
| Deep reply chain | Origin propagation through 3+ reply chain levels |
| Delivery routing (broadcast) | deliveryConfig generates correct spawn options |
| Delivery routing (internal reply) | Replies bypass sender delivery mode |
| Deduplication | Same message ID doesn't trigger duplicate spawn |
| Unknown agent | Graceful skip when target agent doesn't exist |

## Files changed

| File | Change |
|------|--------|
| `extensions/product-team/src/hooks/auto-spawn.ts` | Replaced hardcoded minified symbols with prototype-based class discovery |
| `extensions/product-team/test/integration/multi-hop-messaging.test.ts` | New integration test file (7 tests) |
| `docs/walkthroughs/ft-0002-ws-spawn-sdk-resilience.md` | This walkthrough |
