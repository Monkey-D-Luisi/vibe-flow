# CR-0198 — PR #198 Docker Deployment Review Fixes

| Field  | Value                                      |
|--------|--------------------------------------------|
| Task   | cr-0198                                    |
| PR     | #198 feat(task-0035): docker deployment    |
| Status | DONE                                       |

## Findings

### MUST_FIX

| # | File | Issue |
|---|------|-------|
| M1 | Dockerfile:28 | `pnpm@latest` → non-reproducible build; pin to `pnpm@10.18.1` |
| M2 | Dockerfile:70 | `npx openclaw` may pull arbitrary version; use `pnpm exec openclaw gateway start` |
| M3 | openclaw.docker.json:93-99 | Plugin load paths for `telegram-notifier`, `stitch-bridge`, `model-router`, `team-ui` don't exist → gateway startup failure |
| M4 | openclaw.docker.json:120-129 | `ciFeedback.enabled=true` with `${GITHUB_WEBHOOK_SECRET:-}` (empty default) crashes product-team plugin on startup |
| M5 | .env.docker.example | Missing `GITHUB_WEBHOOK_SECRET`, `GITHUB_OWNER`, `GITHUB_REPO` required by `openclaw.docker.json` |

### SHOULD_FIX

| # | File | Issue |
|---|------|-------|
| S1 | docker-compose.yml:20 | Port `28789:28789` bound to `0.0.0.0` + `auth=none` → unauthenticated LAN exposure; bind to `127.0.0.1` |
| S2 | docs/backlog/EP08-autonomous-product-team.md:6 | Status `PENDING` conflicts with `IN_PROGRESS` in roadmap.md |
| S3 | docs/tasks/0035-docker-deployment-config.md:41-65 | D2 compose example includes `./secrets:/app/secrets:ro` volume and `OPENCLAW_GATEWAY_PORT`/`OPENCLAW_GATEWAY_BIND` env vars not present in actual implementation |

### NIT (skipped)

- Gemini: Multi-stage Dockerfile — valid but significant refactor; deferred to separate task

## Fixes Applied

- M1: Pinned `pnpm@10.18.1` in Dockerfile
- M2: Changed entrypoint to `["pnpm", "exec", "openclaw", "gateway", "start"]`
- M3: Removed non-existent paths from `plugins.load.paths`; kept `plugins.entries` configs for future tasks
- M4: Set `ciFeedback.enabled` to `false`; CI webhook feature deferred to Task 0037 (Telegram integration)
- M5: Added `GITHUB_WEBHOOK_SECRET`, `GITHUB_OWNER`, `GITHUB_REPO` to `.env.docker.example`
- S1: Changed port binding to `127.0.0.1:28789:28789` in `docker-compose.yml`
- S2: Aligned EP08 backlog status to `IN_PROGRESS`
- S3: Updated D2 example in task spec to match implemented solution
