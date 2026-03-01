# Task 0046 -- Docker Compose Production Profile

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0046                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8D — Integration Testing & Hardening                 |
| Status       | DONE                                                 |
| Dependencies | 0042 (Pipeline functional), 0045 (tests pass)       |
| Blocks       | None                                                 |

## Goal

Create a production-ready Docker Compose profile with health checks, log
aggregation, resource limits, automatic restart, volume backup strategy,
secrets management, and monitoring endpoints.

## Context

Task 0035 creates the initial Docker deployment. This task hardens it for
production-like operation: the user wants to leave the Docker container running
autonomously, checking in via Telegram and the web UI.

## Deliverables

### D1: docker-compose.prod.yml (override file)

```yaml
services:
  gateway:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
        reservations:
          cpus: '2.0'
          memory: 4G
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
    labels:
      - "com.openclaw.role=gateway"
      - "com.openclaw.project=product-team"
```

### D2: Health Check Endpoints

The gateway's health check should verify:
- OpenClaw gateway responding
- SQLite database accessible
- At least 1 LLM provider connected
- Telegram bot connected (if configured)
- Event log writable

Route: `GET /health` → `{ status: "ok"|"degraded"|"down", checks: {...} }`

### D3: Secrets Management

Replace `.env.docker` approach with Docker secrets for sensitive values:

```yaml
secrets:
  anthropic_api_key:
    file: ./secrets/anthropic_api_key.txt
  openai_api_key:
    file: ./secrets/openai_api_key.txt
  google_ai_api_key:
    file: ./secrets/google_ai_api_key.txt
  telegram_bot_token:
    file: ./secrets/telegram_bot_token.txt
  stitch_api_key:
    file: ./secrets/stitch_api_key.txt
  github_token:
    file: ./secrets/github_token.txt
```

### D4: Volume Backup Script

`scripts/backup-volumes.sh`:
- Stops the container gracefully
- Copies SQLite DB to timestamped backup file
- Copies workspace metadata (not full git repos, just configs)
- Restarts the container
- Retains last 7 backups

### D5: Monitoring Integration

Register a cron job (using OpenClaw's built-in cron) that:
- Every 5 minutes: posts health status to Telegram if degraded
- Every hour: posts agent activity summary to Telegram
- Every day: posts cost summary to Telegram

### D6: Graceful Shutdown

Ensure `docker compose down` triggers:
1. Complete any in-progress agent runs (or save state for resume)
2. Flush event log to SQLite
3. Close all provider connections
4. Stop Telegram bot polling

Use OpenClaw's `gateway_stop` hook + process shutdown hooks from EP06.

## Acceptance Criteria

- [x] `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` works
- [x] Resource limits prevent Docker host resource exhaustion
- [x] Health check endpoint verifies all critical subsystems
- [x] Secrets are not visible in container environment inspection
- [x] Backup script creates and rotates backups
- [x] Monitoring posts to Telegram on schedule
- [x] Graceful shutdown preserves all state
- [x] Container auto-restarts after crash

## Testing Plan

1. Start with production profile, verify resource limits applied
2. Kill a provider, verify health check reports degraded
3. Run backup script, verify backup files created
4. `docker compose down`, verify graceful shutdown (no data loss)
5. Force-kill container, verify auto-restart
6. Run for 1 hour, verify monitoring messages in Telegram
