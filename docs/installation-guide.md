# Installation Guide

This guide covers how to install the OpenClaw Product Team extensions on any platform where OpenClaw is already running.

## Prerequisites

- **OpenClaw** installed and working ([openclaw.ai](https://openclaw.ai))
- **Node.js 22+**
- **Supported platforms:** Linux, macOS, Windows (native or WSL)

## Available Extensions

| Extension | Description | Dependencies | Notes |
|-----------|-------------|--------------|-------|
| **product-team** | Task engine, workflow, quality tools, VCS automation | `better-sqlite3` (native) | Requires `pnpm rebuild better-sqlite3` after install |
| **quality-gate** | Standalone quality gate engine and CLI | -- | Stateless, no task lifecycle |
| **model-router** | Per-agent model routing hook | -- | |
| **telegram-notifier** | Telegram notification integration | -- | Requires Telegram bot tokens |
| **stitch-bridge** | Google Stitch MCP design bridge | -- | Requires Stitch API key |
| **virtual-office** | Visual office UI for agent activity | -- | |

## Option A: Install from GitHub Release (recommended)

The easiest way to add extensions to an existing OpenClaw instance.

### 1. Download the tarballs

Go to [Releases](https://github.com/Monkey-D-Luisi/vibe-flow/releases) and download the `.tgz` files for the extensions you want.

### 2. Install each extension

```bash
# Install one extension at a time
openclaw plugins install ./openclaw-model-router-0.1.0.tgz
openclaw plugins install ./openclaw-quality-gate-0.1.0.tgz
openclaw plugins install ./openclaw-telegram-notifier-0.1.0.tgz
openclaw plugins install ./openclaw-stitch-bridge-0.1.0.tgz
openclaw plugins install ./openclaw-virtual-office-0.1.0.tgz
openclaw plugins install ./openclaw-product-team-0.1.0.tgz
```

### 3. Rebuild native modules (product-team only)

The `product-team` extension uses `better-sqlite3`, which requires a native build:

```bash
# Navigate to the installed extension directory
cd ~/.openclaw/extensions/product-team
pnpm rebuild better-sqlite3
# or: npm rebuild better-sqlite3
```

### 4. Enable and configure

After installation, each extension is registered in your `openclaw.json`. You can enable/disable them:

```bash
openclaw plugins list         # see installed plugins
openclaw plugins enable <id>  # enable a plugin
openclaw plugins disable <id> # disable a plugin
```

### 5. Minimal configuration

Add the following to your `openclaw.json` under `plugins.entries`:

```json
{
  "plugins": {
    "entries": {
      "product-team": {
        "enabled": true,
        "config": {
          "dbPath": "./data/product-team.db",
          "github": {
            "owner": "<your-github-owner>",
            "repo": "<your-github-repo>",
            "defaultBase": "main"
          }
        }
      },
      "quality-gate": {
        "enabled": true,
        "config": {
          "coverageMinor": 70,
          "coverageMajor": 80,
          "maxAvgCyclomatic": 5.0
        }
      },
      "model-router": {
        "enabled": true
      },
      "telegram-notifier": {
        "enabled": true,
        "config": {
          "groupId": "<your-telegram-group-id>",
          "rateLimit": { "maxPerMinute": 20 }
        }
      },
      "stitch-bridge": {
        "enabled": true,
        "config": {
          "endpoint": "https://stitch.googleapis.com/mcp",
          "defaultProjectId": "",
          "defaultModel": "GEMINI_3_PRO",
          "timeoutMs": 180000,
          "designDir": ".stitch-html"
        }
      },
      "virtual-office": {
        "enabled": true
      }
    }
  }
}
```

## Option B: Install from source (for development)

Use this if you want to contribute or modify the extensions.

### 1. Clone and build

```bash
git clone https://github.com/Monkey-D-Luisi/vibe-flow.git
cd vibe-flow
pnpm install
pnpm build
```

### 2. Link extensions

```bash
# Link individual extensions (no copy, changes reflect immediately)
openclaw plugins install -l ./extensions/product-team
openclaw plugins install -l ./extensions/quality-gate
openclaw plugins install -l ./extensions/model-router
openclaw plugins install -l ./extensions/telegram-notifier
openclaw plugins install -l ./extensions/stitch-bridge
openclaw plugins install -l ./extensions/virtual-office
```

### 3. Rebuild native modules

```bash
cd extensions/product-team
pnpm rebuild better-sqlite3
```

## Option C: Docker (isolated full installation)

Run the entire product team as a standalone Docker container.

### 1. Configure environment

```bash
cp .env.docker.example .env.docker
# Edit .env.docker with your API keys and tokens
```

### 2. Build and run

```bash
docker compose build
docker compose up -d
```

### 3. Access the dashboard

Open `http://localhost:28789` in your browser. The gateway token is configured in `.env.docker`.

See `docker-compose.yml` and `docker-compose.prod.yml` for full configuration options.

## Agents

The product team includes 8 AI agents. Configure them in the `agents.list` section of `openclaw.json`:

| Agent | Role | Default Model |
|-------|------|---------------|
| **pm** | Product Manager | openai-codex/gpt-5.2 |
| **tech-lead** | Tech Lead | anthropic/claude-opus-4-6 |
| **po** | Product Owner | github-copilot/gpt-4.1 |
| **designer** | UI/UX Designer | github-copilot/gpt-4o |
| **back-1** | Backend Developer | anthropic/claude-sonnet-4-6 |
| **front-1** | Frontend Developer | anthropic/claude-sonnet-4-6 |
| **qa** | QA Engineer | anthropic/claude-sonnet-4-6 |
| **devops** | DevOps Engineer | anthropic/claude-sonnet-4-6 |

See `openclaw.json` (local) or `openclaw.docker.json` (Docker) for complete agent configuration with tool permissions, skills, and workspaces.

## Troubleshooting

### `better-sqlite3` build fails

This native module needs C++ build tools:
- **Linux/WSL:** `sudo apt install build-essential python3`
- **macOS:** `xcode-select --install`
- **Windows:** Install Visual Studio Build Tools

Then retry: `pnpm rebuild better-sqlite3`

### Plugin not loading after install

```bash
openclaw plugins doctor    # diagnose plugin issues
openclaw plugins list      # verify installation
```

Check that:
1. The plugin appears in `openclaw plugins list`
2. The plugin is enabled in `plugins.entries`
3. The `openclaw.plugin.json` manifest is present

### Gateway won't start

- Verify your `openclaw.json` is valid JSON
- Check that all referenced extensions exist on disk
- Ensure API keys are configured (check env vars or auth-profiles)

### OpenClaw version mismatch

Extensions are built against OpenClaw `2026.3.2`. If you're on a different version, check the [Releases](https://github.com/Monkey-D-Luisi/vibe-flow/releases) page for a compatible version.
