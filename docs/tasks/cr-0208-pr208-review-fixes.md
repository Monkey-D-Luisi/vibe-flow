# CR-0208 — PR #208 Review Fixes

| Field   | Value                                           |
|---------|-------------------------------------------------|
| PR      | #208 feat(task-0046): Docker Compose production profile |
| CR      | 0208                                            |
| Status  | IN PROGRESS                                     |

## MUST_FIX

- **[M1]** `docker-compose.prod.yml`: `*_KEY_FILE` / `*_TOKEN_FILE` env vars have no effect — the app reads `*_API_KEY` / `TELEGRAM_BOT_TOKEN`, not file-pointer variants. Remove the useless env aliases; add note about Docker secret file paths.
- **[M2]** `monitoring-cron.ts`: `TELEGRAM_BOT_TOKEN_FILE` is used as the bot token value → builds invalid API URL like `https://api.telegram.org/bot/run/secrets/.../sendMessage`. Remove `_FILE` fallback.
- **[M3]** `health-check.ts`: Same `TELEGRAM_BOT_TOKEN_FILE` false-positive in `isTelegramConfigured()`. Remove `_FILE` fallback; also remove `*_API_KEY_FILE` from LLM check.
- **[M4]** `backup-volumes.sh`: Fallback `docker compose run "$SERVICE" tar …` runs through the container ENTRYPOINT, not tar. Add `--entrypoint tar`.

## SHOULD_FIX

- **[S1]** `health-check.ts`: `createHealthCheckHandler` duplicates `getHealthStatus` logic — call the latter.
- **[S2]** `index.ts`: `eventLogWritable` lambda duplicated for cron and health route — extract once; probe `event_log` table rather than a generic `SELECT 1`.
- **[S3]** `graceful-shutdown.ts`: Doc comment claims "flush event log / save agent state" — update to match actual behavior (stop cron, release leases, WAL checkpoint).
- **[S4]** `monitoring-cron.ts`: Timers always start even when Telegram is unconfigured (no-op handlers keep open handles). Call `unref()` on each timer.
- **[S5]** `docker-compose.prod.yml`: Healthcheck uses inline `node -e fetch()` — replace with `curl -f` for consistency with base compose.
- **[S6]** `backup-volumes.sh`: Missing backup-file existence check before rotation; xargs glob failure can abort under `set -euo pipefail`.
- **[S7]** `walkthroughs/0046`: "prunes backups older than 7 days" should be "keeps last 7 backups" (count-based). "flushes the event log / complete in-progress agent runs" is unimplemented — align with reality.
