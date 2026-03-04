# CR-0213 — PR #213 Review Fixes Walkthrough

## What was done

Four issues found during review of PR #213 (per-persona Telegram bots). All are non-functional from a user perspective — the live Telegram flow was working — but they represent correctness, reliability, and maintainability concerns.

## M-1 — monitoring-cron: TELEGRAM_GROUP_ID fallback

**File:** `extensions/product-team/src/services/monitoring-cron.ts` L29

`resolveTelegramConfig` read `TELEGRAM_CHAT_ID` as the env-var fallback for chatId. Docker deployments use `TELEGRAM_GROUP_ID` in `.env.docker.example` and that env var was never documented or set. The monitoring cron would silently disable itself in Docker (token present but chatId empty → `null` config → no notifications).

**Fix:** Added `process.env['TELEGRAM_GROUP_ID']` as the third fallback in the chain:
```typescript
const chatId = deps.telegramChatId ?? process.env['TELEGRAM_CHAT_ID'] ?? process.env['TELEGRAM_GROUP_ID'] ?? '';
```

`TELEGRAM_CHAT_ID` is kept first since existing deployments may have it set.

## S-1 — extractChatIdFromSessionKey: narrow startsWith to strict equality

**Files:** `extensions/product-team/src/hooks/auto-spawn.ts` L132, L122; `test/hooks/auto-spawn.test.ts` L84-91

The first implementation attempt used separate channel IDs per bot (`telegram-tl`, `telegram-designer`). The SDK rejected those (`unknown channel id`). The function's `startsWith('telegram')` was written to match them. After switching to SDK multi-account routing on a single `telegram` channel, that broad check became dead code that also locked in incorrect behavior in two tests.

**Fix:**
- Changed `parts[2].startsWith('telegram')` to `parts[2] === 'telegram'`
- Updated JSDoc to remove `telegram-tl`/`telegram-designer` examples
- Updated two tests from asserting the deprecated channel names return a chatId → asserting they return `null`

The "Why Not Separate Channel IDs" section in the walkthrough already documented why these were rejected; the code now matches that documented intent.

## S-2 — fireAgentViaGatewayWs: stable idempotency key

**File:** `extensions/product-team/src/hooks/auto-spawn.ts` L46, L240, L328, L447

`fireAgentViaGatewayWs` hardcoded `idempotencyKey: \`auto-spawn:${agentId}:${Date.now()}\`` — a unique key on every call, making gateway-level idempotency protection useless. The hook's in-process `isDuplicate()` cache handles the primary case, but if two spawns for the same message reach the gateway from different processes, there was no second line of defense.

**Fix:**
- Added `idempotencyKey?: string` field to `AgentSpawnOptions`
- `handleTeamMessageAutoSpawn` now passes `idempotencyKey: \`tm:${messageId}:${toAgent}\`` in spawnOptions
- `handleTeamReplyAutoSpawn` now passes `idempotencyKey: \`tr:${replyId}:${toAgent}\`` in spawnOptions
- `fireAgentViaGatewayWs` uses `options?.idempotencyKey ?? \`auto-spawn:${agentId}:${Date.now()}\`` as final fallback

Decision escalation still uses `Date.now()` fallback (no stable ID passed), which is acceptable since the dedup cache uses `de:${decisionId}:${agentId}` above.

Updated 5 test assertions to include the new `idempotencyKey` field.

## S-3 — Walkthrough: update extractChatIdFromSessionKey description

**File:** `docs/walkthroughs/ft-0173-per-persona-telegram-bots.md` L56

Updated "matches any channel starting with `telegram`" to "matches the `telegram` channel exactly (`parts[2] === 'telegram'`)".

## Security comments classified as out of scope

Gemini flagged the gateway token and message content being "leaked via command line arguments" and the use of `ADMIN_SCOPE`. Both are design trade-offs documented in the PR itself (`fireAgentViaGatewayWs` comment block): the CLI path cannot be used during concurrent runs, so a raw WS subprocess is required. The script is passed via `--input-type=module -e` (stdin, not argv), and the `ADMIN_SCOPE` is required by the gateway's `agent` method. A structural refactor (e.g. dedicated spawn endpoint) would be out of scope for this CR.
