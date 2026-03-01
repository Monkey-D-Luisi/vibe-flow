# Task 0036 -- Multi-Model Provider Configuration

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0036                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8A — Infrastructure                                  |
| Status       | DONE                                                 |
| Dependencies | 0035 (Docker deployment exists)                      |
| Blocks       | 0038 (Agent roster needs models)                     |

## Goal

Configure the OpenClaw gateway with three LLM providers (OpenAI, Anthropic,
Google) and define the model catalog with fallback chains that each agent role
will use.

## Context

The user has:
- An Anthropic API token (mode: token, stored in auth-profiles.json)
- An OpenAI Codex OAuth flow (mode: oauth, JWT + refresh token via auth.openai.com)
- A GitHub Copilot subscription (mode: token, user token for Copilot proxy API)
- An OpenAI API key for audio transcription only (gpt-4o-mini-transcribe)

The working agent at `~/.openclaw` uses auth-profiles managed by the OpenClaw
runtime, not bare API keys in environment variables. Each provider has a
distinct auth mode: token (Anthropic, GitHub Copilot) or OAuth (OpenAI Codex).
The Docker instance mirrors this architecture.

## Deliverables

### D1: Auth Profiles and Provider Configuration

Add to `openclaw.docker.json` the auth profiles and model providers sections,
matching the working agent architecture:

```jsonc
{
  "auth": {
    "profiles": {
      "anthropic:default": { "provider": "anthropic", "mode": "token" },
      "openai-codex:default": { "provider": "openai-codex", "mode": "oauth" },
      "github-copilot:github": { "provider": "github-copilot", "mode": "token" }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "github-copilot": {
        "baseUrl": "https://api.individual.githubcopilot.com",
        "models": []
      }
    }
  }
}
```

**Auth modes per provider:**
- `anthropic:default` — API token stored in `auth-profiles.json`
- `openai-codex:default` — OAuth JWT + refresh token (auto-renewed by runtime)
- `github-copilot:github` — GitHub user token + rotating proxy token

### D2: Environment Variables and Auth

```env
# .env.docker
# OpenAI API key — ONLY for audio transcription (gpt-4o-mini-transcribe)
OPENAI_API_KEY=<placeholder>
# GitHub token — for VCS and Copilot health checks
GITHUB_TOKEN=<placeholder>
```

**Note:** LLM provider credentials (Anthropic token, OpenAI-Codex OAuth,
GitHub Copilot token) are managed via `openclaw auth login <provider>` and
stored in `agents/<id>/agent/auth-profiles.json`, NOT in environment variables.
Run the auth setup commands before first use.

### D3: Default Model Fallback Chain (input for Task 0038)

All agents share the same default fallback chain, matching the working agent:

| Provider           | Model                        | Auth Mode | Role                    |
|--------------------|------------------------------|-----------|-------------------------|
| `anthropic`        | `claude-sonnet-4-6` (primary)| token     | Default for all agents  |
| `openai-codex`     | `gpt-5.2` (fallback 1)      | oauth     | First fallback          |
| `github-copilot`   | `gpt-4o` (fallback 2)       | token     | Last-resort fallback    |

```jsonc
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-6",
        "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"]
      }
    }
  }
}
```

Per-agent overrides are implemented in Task 0038 (PM→gpt-5.2, TL→opus-4-6,
PO→gpt-4.1, Designer→gpt-4o). All providers use the auth-profiles system.

### D4: Provider Health Check

Register an HTTP route `/api/providers/health` that tests connectivity to each
provider's API and reports status. Used by the Telegram health monitor.

## Acceptance Criteria

- [x] Three auth profiles configured (anthropic:token, openai-codex:oauth, github-copilot:token)
- [x] GitHub Copilot custom provider defined in models.providers
- [x] Each provider authenticates via its native mode (verified by health check)
- [x] Default fallback chain: anthropic/claude-sonnet-4-6 → openai-codex/gpt-5.2 → github-copilot/gpt-4o
- [x] Provider health check route returns status for all providers
- [x] Audio transcription configured (openai/gpt-4o-mini-transcribe via OPENAI_API_KEY)
- [x] Auth credentials managed via auth-profiles.json (not hardcoded env vars)
- [x] Cost tracking from EP06 still works with the new providers

## Testing Plan

1. Start Docker container with valid API keys
2. Call provider health check: `GET /api/providers/health`
3. Verify each provider returns `connected: true`
4. Test fallback: intentionally break primary provider key, verify fallback activates
5. Verify cost tracking logs include per-provider cost data

## Technical Notes

- Auth is managed via OpenClaw's native auth-profiles system, not bare env vars.
  Run `openclaw auth login anthropic`, `openclaw auth login openai-codex`,
  `openclaw auth login github-copilot` to set up each profile.
- OpenAI-Codex uses OAuth (JWT + refresh token from auth.openai.com). The
  runtime handles automatic token refresh when the JWT expires.
- GitHub Copilot uses a user token (`ghu_...`) plus a rotating proxy token
  managed by the `copilot-proxy` extension.
- `OPENAI_API_KEY` env var is used ONLY for audio transcription
  (gpt-4o-mini-transcribe via the `openai-whisper-api` skill), not for LLM
  completions.
- The `messages.responsePrefix: "[{provider}/{model}]\n\n"` config makes it
  visible in Telegram which model actually responded.
