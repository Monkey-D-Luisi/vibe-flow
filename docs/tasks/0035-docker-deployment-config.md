# Task 0035 -- Docker Deployment Configuration

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0035                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8A — Infrastructure                                  |
| Status       | DONE                                                 |
| Dependencies | EP07 complete                                        |
| Blocks       | 0036, 0037, 0038                                     |

## Goal

Create a Docker-based deployment for an isolated OpenClaw gateway instance that
runs the autonomous product team. The container must not collide with the
existing OpenClaw installation running on port 18789 in WSL.

## Context

The user runs OpenClaw as a desktop app from WSL, accessible at
`127.0.0.1:18789`. A Windows node connects to this gateway. The Docker
instance must be fully independent: its own gateway, its own SQLite database,
its own project workspaces, accessible from the host machine at port 28789.

## Deliverables

### D1: Dockerfile

```
Base image: node:22-slim
Install: pnpm, git, gh CLI, build-essential (for better-sqlite3)
Copy: extensions/, packages/, skills/, openclaw.json, package.json, pnpm-workspace.yaml
Run: pnpm install --frozen-lockfile
Entrypoint: openclaw gateway
Expose: 28789
```

### D2: docker-compose.yml

```yaml
services:
  gateway:
    build: .
    ports:
      - "127.0.0.1:28789:28789"
    volumes:
      - openclaw-data:/app/data          # SQLite DB persistence
      - openclaw-workspaces:/workspaces  # Project git clones
    environment:
      - NODE_ENV=production
    env_file:
      - .env.docker
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:28789/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  openclaw-data:
  openclaw-workspaces:
```

### D3: .env.docker.example

Template with all required environment variables:
- `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_*`
- `OPENAI_API_KEY` or `OPENAI_OAUTH_*`
- `GOOGLE_AI_API_KEY`
- `GITHUB_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_GROUP_ID`
- `STITCH_API_KEY`

### D4: .dockerignore

Exclude node_modules, .git, data/, secrets/, docs/, .claude/

### D5: openclaw.docker.json

Gateway configuration for the Docker instance:
- Port 28789
- Bind 0.0.0.0 (accessible from host)
- Control UI enabled at `/`
- All plugins loaded
- Agent roster with 10 agents
- Telegram channel configuration
- Model providers configured

## Acceptance Criteria

- [x] `docker compose build` succeeds without errors
- [x] `docker compose up` starts the gateway on port 28789
- [x] Gateway health check endpoint responds 200
- [x] Control UI accessible at `http://localhost:28789/`
- [x] Existing WSL OpenClaw on 18789 is unaffected
- [x] SQLite database persists across container restarts
- [x] Project workspaces persist across container restarts
- [x] Container can reach GitHub API (for PR operations)
- [x] Container can reach Stitch MCP endpoint
- [x] Container can reach Telegram API

## Testing Plan

1. Build image: `docker compose build`
2. Start container: `docker compose up -d`
3. Verify health: `curl http://localhost:28789/health`
4. Verify UI: Open `http://localhost:28789/` in browser
5. Verify no collision: Confirm `http://localhost:18789/` still works
6. Stop and restart: `docker compose down && docker compose up -d`
7. Verify persistence: Check SQLite DB and workspaces survived restart

## Technical Notes

- The `openclaw` npm package must be installed globally in the container OR
  the gateway must be started via the project's own `node_modules/.bin/openclaw`
- `better-sqlite3` requires native rebuild; the Dockerfile must include
  `build-essential` and run `pnpm rebuild better-sqlite3`
- Network mode should be `bridge` (default), not `host`, to avoid port conflicts
- The container needs outbound HTTPS access for: GitHub API, Stitch MCP,
  Telegram API, OpenAI API, Anthropic API, Google AI API
