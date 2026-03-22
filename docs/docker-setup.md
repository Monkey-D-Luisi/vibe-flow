# Docker Setup — Autonomous Product Team

Plug-and-play guide for deploying the OpenClaw autonomous product team in a Docker container.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Access to [OpenClaw](https://openclaw.ai) gateway
- Existing auth credentials from a working OpenClaw installation (WSL or native)

## Quick Start (repeat deployment)

```bash
# 1. Create .env.docker (see template below)
cp .env.docker.example .env.docker
# Edit .env.docker with your real values

# 2. Build and start
docker compose build
docker compose up -d

# 3. Copy auth credentials into the running container volume
# (See "Auth Credentials" section below)

# 4. Restart to pick up credentials
docker compose restart

# 5. Verify
docker exec openclaw-product-team pnpm exec openclaw models list
docker exec openclaw-product-team pnpm exec openclaw doctor
```

## Current Baseline (2026-03-22)

Expected runtime state in this repository:

- Compose service: `gateway`
- Container name: `openclaw-product-team`
- UI URL: `http://localhost:28789/`
- Health endpoint: `http://localhost:28789/health`

Verification commands:

```bash
docker compose ps
docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' openclaw-product-team
```

`docker compose ps` should show `Up ... (healthy)` for `openclaw-product-team`.

## Architecture

```
Host (Windows/Mac/Linux)
  |
  +-- Browser: http://localhost:28789/       (Control UI)
  |
  +-- Docker Container: openclaw-product-team
        |
        +-- OpenClaw Gateway (port 28789, foreground mode)
        +-- 6 plugins: product-team, quality-gate, telegram-notifier,
        |              model-router, stitch-bridge, virtual-office
        +-- 8 agents: pm, tech-lead, po, designer, back-1,
        |             front-1, qa, devops
        +-- Telegram bots: @AiTeam_ProductManager_bot, @AiTeam_TechLead_bot,
        |                  @AiTeam_Designer_bot
        |
        +-- Volumes:
              openclaw-data       -> /app/data       (SQLite DBs)
              openclaw-state      -> /root/.openclaw  (config, auth, sessions)
              openclaw-workspaces -> /workspaces      (project clones)
```

## Environment Variables (.env.docker)

Create a `.env.docker` file in the repo root with these values:

```env
# -- Audio Transcription Only --
OPENAI_API_KEY=sk-proj-...      # For gpt-4o-mini-transcribe. NOT used by agents.

# -- GitHub --
GITHUB_TOKEN=...               # GitHub token from `gh auth token` or a classic PAT
GITHUB_OWNER=Monkey-D-Luisi
GITHUB_REPO=vibe-flow
GITHUB_WEBHOOK_SECRET=...     # For CI feedback webhook (when github.ciFeedback.enabled=true)

# -- Telegram (3 separate bot tokens -- one per persona) --
TELEGRAM_BOT_TOKEN_PM=...        # From @BotFather (PM bot)
TELEGRAM_BOT_TOKEN_TL=...        # From @BotFather (Tech Lead bot)
TELEGRAM_BOT_TOKEN_DESIGNER=...  # From @BotFather (Designer bot)
TELEGRAM_GROUP_ID=-100...     # Prefix with -100, e.g. web URL #-5177552677 -> -1005177552677

# -- Stitch (design tool MCP bridge) --
STITCH_API_KEY=AQ....

# -- Gateway Auth Token (any random string) --
OPENCLAW_GATEWAY_TOKEN=ocgw_...

# -- Health check (optional) --
HEALTH_CHECK_SECRET=...
```

> **Note**: Provider tokens (Anthropic, OpenAI Codex, GitHub Copilot) are NOT stored in env vars. They live in `auth-profiles.json` inside the Docker volume. See [Auth Credentials](#auth-credentials). `OPENAI_API_KEY` is only for audio transcription.

### Telegram Group ID conversion

The Telegram web URL shows the group ID without the `-100` prefix:
- Web URL: `https://web.telegram.org/k/#-5177552677`
- Actual ID: `-1005177552677` (prefix `-100` to the number)

## Auth Credentials

The agents use three distinct authentication mechanisms for model providers.
These are **NOT** API keys — they are session tokens/OAuth credentials that expire and need periodic renewal.

> **Important**: Provider tokens are NOT in env vars — they all live in `auth-profiles.json`. `OPENAI_API_KEY` in `.env.docker` is **only** for audio transcription (uses the standard `openai` provider, not `openai-codex`).

| Provider | Auth Type | Token Prefix | Expiration |
|----------|-----------|-------------|------------|
| `anthropic:default` | Token | `sk-ant-oat01-...` | Long-lived (months) |
| `openai-codex:default` | OAuth | JWT (`eyJ...`) | Access: hours; Refresh: days |
| `github-copilot:github` | Token | `ghu_...` | Hours (auto-refresh available) |

### How to obtain each token

#### Anthropic (claude setup-token)

```bash
# On any machine with Claude CLI installed
claude setup-token

# This outputs a token like: sk-ant-oat01-35OOUrMbF-...
# This is NOT a traditional Anthropic API key from console.anthropic.com
# It is a session token that authenticates via Claude's token-based auth
```

The token goes into `auth-profiles.json` under the key `anthropic:default`:
```json
{
  "anthropic:default": {
    "type": "token",
    "provider": "anthropic",
    "token": "sk-ant-oat01-...",
    "createdAt": "2026-02-28T..."
  }
}
```

#### OpenAI Codex (OAuth device flow)

```bash
# On a machine with OpenAI Codex CLI / OpenClaw
openclaw auth login --provider openai-codex

# This opens a browser for OAuth consent
# After approval, it generates:
#   - access token (JWT, expires in hours)
#   - refresh token (long-lived, used to renew access token)
#   - accountId
```

The tokens go into two files:

`auth-profiles.json` entry:
```json
{
  "openai-codex:default": {
    "type": "oauth",
    "provider": "openai-codex",
    "accessToken": "eyJ...",
    "refreshToken": "ort_...",
    "expiresAt": "2026-03-02T...",
    "accountId": "org-..."
  }
}
```

`auth.json` (mirrors the OAuth tokens for OpenClaw's internal token manager):
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "ort_...",
  "expiresAt": "2026-03-02T...",
  "accountId": "org-..."
}
```

#### GitHub Copilot (device flow)

```bash
# On a machine with GitHub Copilot CLI / OpenClaw
openclaw auth login --provider github-copilot

# This triggers a device flow:
#   1. Shows a code like XXXX-XXXX
#   2. Opens https://github.com/login/device
#   3. Enter the code and authorize
#   4. Generates a ghu_ token
```

The token goes into two files:

`auth-profiles.json` entry:
```json
{
  "github-copilot:github": {
    "type": "token",
    "provider": "github-copilot",
    "token": "ghu_...",
    "createdAt": "2026-02-28T..."
  }
}
```

`credentials/github-copilot.token.json`:
```json
{
  "token": "ghu_...",
  "expires_at": "2026-03-02T..."
}
```

### Where credentials live

On the source machine (e.g. WSL):
```
~/.openclaw/
  agents/main/agent/
    auth-profiles.json   # All 3 provider credentials (single file)
    auth.json            # OpenAI Codex OAuth tokens (access + refresh + expires)
  credentials/
    github-copilot.token.json   # GitHub Copilot session token
```

### Copying credentials to the Docker container

After the first `docker compose up -d`, copy credentials from your existing OpenClaw installation:

```bash
# From WSL (adjust paths if your source is different)
SOURCE="$HOME/.openclaw"
CONTAINER="openclaw-product-team"

# Create target directories
docker exec $CONTAINER mkdir -p /root/.openclaw/agents/main/agent /root/.openclaw/credentials

# Copy auth files
docker cp "$SOURCE/agents/main/agent/auth-profiles.json" $CONTAINER:/root/.openclaw/agents/main/agent/
docker cp "$SOURCE/agents/main/agent/auth.json" $CONTAINER:/root/.openclaw/agents/main/agent/
docker cp "$SOURCE/credentials/github-copilot.token.json" $CONTAINER:/root/.openclaw/credentials/

# Restart to pick up
docker compose restart
```

From Windows (if source is WSL):
```powershell
$SOURCE = "\\wsl.localhost\Ubuntu\home\luiss\.openclaw"
$CONTAINER = "openclaw-product-team"

docker exec $CONTAINER mkdir -p /root/.openclaw/agents/main/agent /root/.openclaw/credentials

docker cp "$SOURCE\agents\main\agent\auth-profiles.json" "${CONTAINER}:/root/.openclaw/agents/main/agent/"
docker cp "$SOURCE\agents\main\agent\auth.json" "${CONTAINER}:/root/.openclaw/agents/main/agent/"
docker cp "$SOURCE\credentials\github-copilot.token.json" "${CONTAINER}:/root/.openclaw/credentials/"

docker compose restart
```

### Token Renewal

When tokens expire, re-obtain them on the source machine and repeat the `docker cp` steps.

| Token | How to Renew |
|-------|-------------|
| Anthropic | Run `claude setup-token` again |
| OpenAI Codex | Use the in-container login (recommended, see below) or copy from host |
| GitHub Copilot | `openclaw auth login --provider github-copilot` (device flow) |

### In-Container OpenAI Codex Login (recommended)

The simplest way to renew or set up OpenAI Codex OAuth tokens is to run
the Codex CLI device-flow directly inside the container:

```bash
# Option A: convenience script (login + restart in one step)
./scripts/codex-login.sh

# Option B: manual commands
docker exec -it openclaw-product-team npx @openai/codex auth login --device-auth
docker compose -f docker-compose.yml restart
```

This displays a URL and code — open the URL in your browser, enter the code,
and sign in with your OpenAI account.

On container restart, the entrypoint automatically:
1. Converts Codex CLI tokens (`/root/.codex/auth.json`) to OpenClaw format
2. Merges them into `auth-profiles.json`
3. Propagates the fresh tokens to all agent directories (pm, tech-lead, etc.)

### Verify auth status

```bash
docker exec openclaw-product-team pnpm exec openclaw models list
# All 3 providers should show auth=yes
```

## Agent Model Assignments

| Agent | Role | Primary Model | Fallbacks |
|-------|------|---------------|-----------|
| pm | Product Manager | openai-codex/gpt-5.2 | anthropic/claude-sonnet-4-6, github-copilot/gpt-4o |
| tech-lead | Tech Lead | anthropic/claude-opus-4-6 | openai-codex/gpt-5.2, github-copilot/gpt-4o |
| po | Product Owner | github-copilot/gpt-4.1 | anthropic/claude-sonnet-4-6, openai-codex/gpt-5.2 |
| designer | UI/UX Designer | github-copilot/gpt-4o | anthropic/claude-sonnet-4-6, openai-codex/gpt-5.2 |
| back-1 | Backend Developer | anthropic/claude-sonnet-4-6 | openai-codex/gpt-5.2, github-copilot/gpt-4o |
| front-1 | Frontend Developer | anthropic/claude-sonnet-4-6 | openai-codex/gpt-5.2, github-copilot/gpt-4o |
| qa | QA Engineer | anthropic/claude-sonnet-4-6 | openai-codex/gpt-5.2, github-copilot/gpt-4o |
| devops | DevOps Engineer | anthropic/claude-sonnet-4-6 | openai-codex/gpt-5.2, github-copilot/gpt-4o |

## Key Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Container build: node:22-slim, pnpm, git, gh CLI, build tools, better-sqlite3 |
| `docker-compose.yml` | Service definition: ports, volumes, healthcheck, env |
| `openclaw.docker.json` | Full OpenClaw config (copied to `/root/.openclaw/openclaw.json` at startup via `envsubst`) |
| `scripts/docker-entrypoint.sh` | Startup: expands env vars, configures git auth, starts gateway |
| `.env.docker` | Secrets (git-ignored) |
| `.dockerignore` | Excludes `**/node_modules/` (critical for Windows hosts) |

## Entrypoint Behavior (scripts/docker-entrypoint.sh)

On every container start:
1. Creates `/root/.openclaw/` directory
2. Runs `envsubst` to expand `${ENV_VAR}` placeholders in `openclaw.json` -> `/root/.openclaw/openclaw.json`
3. Rebuilds `better-sqlite3` native module if missing
4. Configures git credential helper with `GITHUB_TOKEN` for HTTPS clones
5. Starts `openclaw gateway run` in foreground on port 28789

**Important**: `envsubst` overwrites the config file but does NOT touch auth files in subdirectories (`agents/`, `credentials/`). Auth files persist across restarts via the `openclaw-state` volume.

## Browser Access

### Control UI
- URL: `http://localhost:28789/`
- Provides: Chat, Config editing, Sessions, Channels, Cron, Skills, Nodes, Exec approvals, Logs, Debug, Update
- Device pairing is disabled for Docker (`dangerouslyDisableDeviceAuth: true` in `openclaw.docker.json`)
  because Docker bridge networking prevents the gateway from recognizing browser connections as loopback.
  Token auth (`gateway.auth.mode: "token"`) and the `127.0.0.1` port binding still protect access.
- On first visit, paste the dashboard URL from container startup logs (includes the token hash fragment).

## Telegram

- Bot: `@AiProductTeamBot`
- Commands: `/idea <text>`, `/health`, `/teamstatus`, `/budget`
- DM policy: open (anyone can DM the bot)
- Group policy: open (bot responds in any group it's added to)
- All Telegram messages route to the `pm` agent by default

## Troubleshooting

### Container won't start
```bash
docker logs openclaw-product-team 2>&1 | head -50
```

### Models show auth=no
```bash
docker exec openclaw-product-team pnpm exec openclaw models list
```
Re-copy auth files from source installation (see Auth Credentials section).

### Telegram bot not responding
Check group policy in `openclaw.docker.json`:
```json
"channels": {
  "telegram": {
    "groupPolicy": "open",
    "allowFrom": ["*"]
  }
}
```

### Control UI shows "Disconnected"
Verify that `/root/.openclaw/openclaw.json` inside the container includes
`"dangerouslyDisableDeviceAuth": true` in the `controlUi` block. If missing,
rebuild the image (`docker compose build && docker compose up -d`).

### Plugin ID mismatch warnings
These are cosmetic warnings from OpenClaw's path-based plugin ID inference. They don't affect functionality. The plugin IDs in the manifest files and source code are consistent.

### Windows-specific: symlink contamination
The `.dockerignore` uses `**/node_modules/` to exclude ALL nested node_modules. This prevents Windows symlinks from leaking into the Linux container. Never change this to just `node_modules/`.

## Maintenance

### Updating the container
```bash
git pull
docker compose build
docker compose up -d
# Auth credentials persist in the openclaw-state volume — no need to re-copy
```

### Viewing logs
```bash
docker compose logs -f gateway
```

### Full doctor check
```bash
docker exec openclaw-product-team pnpm exec openclaw doctor
```

### Resetting state
```bash
# Remove all data (tasks, sessions, auth) and start fresh
docker compose down -v
docker compose up -d
# Re-copy auth credentials after reset
```
