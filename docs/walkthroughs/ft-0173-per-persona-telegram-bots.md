# Walkthrough — ft-0173 Per-Persona Telegram Bot Channels

## Problem

All 10 agents shared a single Telegram bot token. This meant:
- Users could not DM individual personas (all DMs went to the same bot)
- When the tech lead spawned via escalation policies, it responded from the PM bot
- No way to distinguish bot identity in group conversations

## Solution

### Multi-Account Architecture (SDK-native)

Uses the OpenClaw SDK's built-in multi-account support for a single `telegram`
channel. Three bot tokens are configured via `channels.telegram.accounts`:

| Account     | Bot Token Env Var              | Bound Agents                                     |
|-------------|-------------------------------|--------------------------------------------------|
| *(default)* | `TELEGRAM_BOT_TOKEN_PM`       | pm, po, back-1, back-2, front-1, front-2, qa, devops |
| `tl`        | `TELEGRAM_BOT_TOKEN_TL`       | tech-lead                                         |
| `designer`  | `TELEGRAM_BOT_TOKEN_DESIGNER` | designer                                          |

Agent bindings use `match.accountId` to scope agents to specific accounts:
```json
{ "agentId": "tech-lead", "match": { "channel": "telegram", "accountId": "tl" } }
{ "agentId": "designer",  "match": { "channel": "telegram", "accountId": "designer" } }
```

### Session Key & Delivery Routing

Session keys remain unchanged: `agent:<id>:telegram:(group|dm):<chatId>`.
The SDK stores `accountId` in `DeliveryContext` per-session, which tells the
gateway which bot token to use for outbound messages.

`rebuildSessionKeyForAgent()` replaces only the agent ID segment (2-param).
No channel override is needed because all bots share the `telegram` channel.

### agentAccounts Config

A `delivery.agentAccounts` map in `openclaw.docker.json` tells the spawn hooks
which Telegram account each agent uses:

```json
"agentAccounts": {
  "tech-lead": "tl",
  "designer":  "designer"
}
```

Agents not in this map use the default account (PM bot).

### Key Code Paths

1. **`handleTeamMessageAutoSpawn`** — looks up `deliveryConfig.agentAccounts[toAgent]`, passes `accountId` in spawn options so the gateway routes the response via the correct bot
2. **`handleTeamReplyAutoSpawn`** — same logic for reply routing
3. **`extractChatIdFromSessionKey`** — matches the `telegram` channel exactly (`parts[2] === 'telegram'`)
4. **`fireAgentViaGatewayWs`** — passes `accountId` in the WS `agent` method params
5. **`monitoring-cron`** — reads `TELEGRAM_BOT_TOKEN_PM` with fallback to `TELEGRAM_BOT_TOKEN`

### Why Not Separate Channel IDs?

The first attempt used separate channel IDs (`telegram-tl`, `telegram-designer`).
The SDK rejected these with `unknown channel id` because custom channel names
must be registered via a plugin manifest's `channels` array. The SDK's native
`accounts` sub-key is the correct approach — it creates separate `Bot` instances
per account within a single validated channel.

## Files Changed

| File | Change |
|------|--------|
| `.env.docker` | 3 per-bot token vars |
| `.env.docker.example` | Template updated |
| `openclaw.docker.json` | Single telegram channel with `accounts`, updated bindings with `accountId`, `delivery.agentAccounts` |
| `docker-compose.prod.yml` | Per-bot Docker secrets |
| `extensions/product-team/openclaw.plugin.json` | Added `agentAccounts` to delivery schema |
| `extensions/product-team/src/config/plugin-config.ts` | `agentAccounts` in DeliveryConfig + parser |
| `extensions/product-team/src/hooks/auto-spawn.ts` | `accountId` in AgentSpawnOptions, spawn handlers, WS trigger |
| `extensions/product-team/src/services/monitoring-cron.ts` | Token env var updated |
| `extensions/product-team/test/config/plugin-config.test.ts` | 3 tests for agentAccounts |
| `extensions/product-team/test/hooks/auto-spawn.test.ts` | Updated tests for accountId routing |
