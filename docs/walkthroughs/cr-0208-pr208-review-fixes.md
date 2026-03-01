# Walkthrough CR-0208 — PR #208 Review Fixes

## Summary

Addressed 4 MUST_FIX and 7 SHOULD_FIX findings from Copilot and Gemini reviews of PR #208.

## Changes

- `docker-compose.prod.yml`: Removed invalid `*_KEY_FILE`/`*_TOKEN_FILE` env vars (app reads `*_API_KEY` / `TELEGRAM_BOT_TOKEN`, not file pointers); switched healthcheck to `curl -f`; added comment about Docker secrets path.
- `extensions/product-team/src/services/health-check.ts`: `createHealthCheckHandler` now delegates to `getHealthStatus`; removed `TELEGRAM_BOT_TOKEN_FILE` and `*_API_KEY_FILE` false-positive checks.
- `extensions/product-team/src/services/monitoring-cron.ts`: Removed `TELEGRAM_BOT_TOKEN_FILE` fallback; `unref()` all interval timers so they don't keep the process alive when Telegram is absent.
- `extensions/product-team/src/hooks/graceful-shutdown.ts`: Corrected doc comment to reflect actual behavior (stop cron → expire leases → WAL checkpoint).
- `extensions/product-team/src/index.ts`: Extracted shared `eventLogWritable` function (eliminates duplication); probe changed to `SELECT 1 FROM event_log LIMIT 1` for accurate subsystem isolation.
- `scripts/backup-volumes.sh`: Added `--entrypoint tar` to fallback `docker compose run`; added backup-file existence check before rotation; made rotation glob failure non-fatal.
- `docs/walkthroughs/0046-docker-production-profile.md`: Corrected retention wording to "last 7 backups" (count-based); aligned shutdown description with actual implementation.

## Verification

- typecheck: PASS
- lint: PASS
- tests: PASS
