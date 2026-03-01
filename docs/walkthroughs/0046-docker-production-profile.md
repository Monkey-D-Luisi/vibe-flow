# Walkthrough 0046 -- Docker Production Profile

## Summary

Created a production-hardened Docker Compose override file
(`docker-compose.prod.yml`) that layers on top of the base `docker-compose.yml`
from Task 0035. The production profile adds CPU and memory resource limits
(4 CPU / 8 GB limit, 2 CPU / 4 GB reservation), JSON log rotation (50 MB x 5
files), container restart policy (`unless-stopped`), Docker secrets for all API
keys and tokens (replacing plain `.env` variables), a health check endpoint
verifying gateway, SQLite, LLM providers, and Telegram connectivity, and a
volume backup script that keeps the last 7 backups (count-based). A monitoring cron posts degraded health
and daily cost summaries to Telegram. Graceful shutdown stops the monitoring cron,
expires active leases, and WAL-checkpoints the database before container stop.

## Changes

- `docker-compose.prod.yml`: Production override with resource limits, log rotation, restart policy, secrets references, and enhanced health check command
- `scripts/backup-volumes.sh`: Backup script that stops the container, copies SQLite DB to a timestamped archive, restarts the container, and retains the last 7 backups
- `extensions/product-team/src/services/health-check.ts`: Health check handler at `GET /health` returning status (ok/degraded/down) with per-subsystem check results
- `extensions/product-team/src/services/monitoring-cron.ts`: Cron service posting health status every 5 minutes when degraded, agent activity hourly, and cost summary daily to Telegram
- `extensions/product-team/src/hooks/graceful-shutdown.ts`: Gateway stop hook that stops the monitoring cron, expires active leases, and WAL-checkpoints the database

## Verification

- typecheck: PASS
- lint: PASS
- tests: N/A (infrastructure files, validated via Docker build + health check)
