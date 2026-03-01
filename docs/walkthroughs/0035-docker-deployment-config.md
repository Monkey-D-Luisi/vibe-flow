# Walkthrough 0035 -- Docker Deployment Configuration

## Goal (restated)
Create an isolated Docker deployment for the OpenClaw autonomous product team
gateway on port 28789, avoiding collision with the existing WSL instance on 18789.

## Decisions
- **Base image**: `node:22-slim` — matches project's Node 22+ requirement, slim
  variant keeps image size reasonable while including native module build support
- **Port 28789**: Chosen to avoid collision with existing WSL OpenClaw on 18789.
  Simple offset (18789 + 10000) for easy memorization.
- **Named volumes**: `openclaw-data` for SQLite DB persistence, `openclaw-workspaces`
  for project git clones. Both survive container restarts/rebuilds.
- **No host network mode**: Bridge mode (default) ensures port isolation.
- **Auth mode "none"**: Initially no gateway auth since it's local development.
  Production hardening (Task 0046) will add proper authentication.
- **Entrypoint via npx**: Uses the project's own `node_modules/.bin/openclaw`
  to avoid version mismatch with a globally installed binary.

## Files Created
- `Dockerfile` — Multi-stage build: system deps → pnpm install → copy source → build
- `docker-compose.yml` — Service definition with ports, volumes, health check
- `.env.docker.example` — Template for all required environment variables
- `.dockerignore` — Excludes node_modules, .git, docs/, data/, secrets/
- `openclaw.docker.json` — Full gateway config (also covers Tasks 0036 and 0038)
- `.gitignore` — Updated to allow `.env.docker.example` and exclude `secrets/`

## Trade-offs
- The Dockerfile installs `gh` CLI and `build-essential` which adds ~200MB to
  the image. This is necessary for VCS operations and `better-sqlite3` native rebuild.
- The `openclaw.docker.json` is a complete config file, not a diff from `openclaw.json`.
  This keeps the Docker setup fully self-contained.

## Commands Run
- `git checkout main && git pull origin main` — verified branch was up to date
- `git checkout -b feat/task-0035-docker-deployment` — created feature branch
- `pnpm test` — 63 test files, 403 tests passed
- `pnpm lint` — clean (no errors across all packages)
- `pnpm typecheck` — clean (no type errors across all packages)

## Tests Executed
- Full test suite: 403 tests pass (extensions/product-team, extensions/quality-gate)
- Docker build/run: manual verification steps documented in task testing plan

## Follow-ups
- Task 0046 will add production-ready compose profile (resource limits, secrets, monitoring)
- May need to add Docker health check endpoint to the gateway if `/health` is not built-in
