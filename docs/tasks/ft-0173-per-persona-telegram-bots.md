# ft-0173 — Per-Persona Telegram Bot Channels

| Field     | Value                       |
|-----------|-----------------------------|
| Type      | config / infra              |
| Scope     | minor                       |
| Status    | done                        |
| Author    | agent                       |

## Objective

Replace the single shared Telegram bot with 3 individual bots (PM, Tech Lead, Designer) so:
1. Users can DM each persona directly via its own bot
2. When an agent spawns via delivery policies, it responds from its own bot
3. Existing delivery policies and conversation flows are preserved

## Changes

### Config
- `.env.docker` / `.env.docker.example` — `TELEGRAM_BOT_TOKEN` → `TELEGRAM_BOT_TOKEN_PM`, `TELEGRAM_BOT_TOKEN_TL`, `TELEGRAM_BOT_TOKEN_DESIGNER`
- `openclaw.docker.json` — single `telegram` channel with `accounts` sub-key (`tl`, `designer`), bindings with `match.accountId`, new `delivery.agentAccounts` map
- `openclaw.plugin.json` — added `agentAccounts` to delivery config schema
- `docker-compose.prod.yml` — per-bot Docker secrets

### Source
- `plugin-config.ts` — `DeliveryConfig.agentAccounts` field + parser
- `auto-spawn.ts` — `AgentSpawnOptions.accountId` field; spawn handlers resolve `accountId` via `agentAccounts`; `fireAgentViaGatewayWs` passes `accountId` in WS params
- `monitoring-cron.ts` — reads `TELEGRAM_BOT_TOKEN_PM` with fallback

### Tests
- `plugin-config.test.ts` — 3 tests for agentAccounts parsing
- `auto-spawn.test.ts` — updated tests for accountId routing pattern

## Verification
- `pnpm test` — 600 passed
- `pnpm typecheck` — clean
- `pnpm lint` — clean
