# CR-0213 — PR #213 Review Fixes

| Field | Value |
|-------|-------|
| PR | #213 feat(telegram): per-persona bots, architecture report & CI fixes |
| Created | 2026-03-04 |
| Status | in-progress |
| Scope | patch |

## Findings

### M-1 (MUST_FIX) — monitoring-cron: TELEGRAM_CHAT_ID missing TELEGRAM_GROUP_ID fallback

`resolveTelegramConfig` reads `TELEGRAM_CHAT_ID` as the chatId env fallback, but `.env.docker.example`
and all deployment docs use `TELEGRAM_GROUP_ID`. The monitoring cron is silently disabled in Docker
unless users discover and set an undocumented env var.

**Fix:** add `process.env['TELEGRAM_GROUP_ID']` as secondary fallback in `monitoring-cron.ts`.

### S-1 (SHOULD_FIX) — extractChatIdFromSessionKey: overly broad startsWith check

`parts[2].startsWith('telegram')` was intentionally written to match `telegram-tl`/`telegram-designer`
channel IDs — the first implementation approach that was rejected by the SDK (unknown channel ID).
The current architecture uses a single `telegram` channel with per-account routing. The broad check
is a dead-code path that misleads readers and locks in incorrect behavior in tests.

**Fix:**
- Change L132 to `parts[2] === 'telegram'`
- Remove JSDoc examples for `telegram-tl` / `telegram-designer`
- Convert the two tests that assert `telegram-tl`/`telegram-designer` return a chatId → assert they return `null` (now that the channel names are invalid)

### S-2 (SHOULD_FIX) — fireAgentViaGatewayWs: Date.now() idempotency key

`idempotencyKey: \`auto-spawn:${agentId}:${Date.now()}\`` generates a unique key on every call,
making the gateway-level idempotency check useless. The hook already deduplicates via `isDuplicate()`
with a message-ID-based key, but the gateway never gets a stable key to guard against double-fires
across process boundaries.

**Fix:**
- Add `idempotencyKey?: string` to `AgentSpawnOptions`
- Pass `idempotencyKey: \`tm:${messageId}:${toAgent}\`` from `handleTeamMessageAutoSpawn`
- Pass `idempotencyKey: \`tr:${replyId}:${toAgent}\`` from `handleTeamReplyAutoSpawn`
- Use `options?.idempotencyKey ?? \`auto-spawn:${agentId}:${Date.now()}\`` in `fireAgentViaGatewayWs`

### S-3 (SHOULD_FIX) — Walkthrough: extractChatIdFromSessionKey description outdated

Line 57 still says the function "matches any channel starting with `telegram`". After S-1 fix, update
to reflect `=== 'telegram'` check.

### Out of scope / classified

| Comment | Classification | Rationale |
|---------|----------------|-----------|
| Gemini: gateway token + message content visible in script | FALSE_POSITIVE | Script is passed via `--input-type=module -e` (stdin), not argv. Token is inlined from env. Pre-existing trade-off documented in PR (CLI path cannot be used; raw WS is required). Structural refactor out of scope for this CR. |
| Copilot: `.env.docker.example` missing `TELEGRAM_BOT_TOKEN` alias | SUGGESTION | monitoring-cron already has `TELEGRAM_BOT_TOKEN` fallback; adding it to example would imply it is required. Not acted on. |
