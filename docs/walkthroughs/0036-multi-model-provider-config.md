# Walkthrough 0036 -- Multi-Model Provider Configuration

## Goal (restated)
Configure the OpenClaw gateway with LLM providers using the same auth-profile
architecture as the working agent. Set up the provider health check endpoint
and audio transcription.

## Decisions
- **Mixed auth (not API-key-only)**: The working agent at `~/.openclaw` uses
  three distinct auth modes: Anthropic (token), OpenAI-Codex (OAuth with JWT +
  refresh token), and GitHub Copilot (user token + rotating proxy token). The
  Docker instance mirrors this architecture rather than simplifying to API keys.
- **Auth profiles**: Credentials are managed via `auth.profiles` in
  `openclaw.docker.json` and the runtime's `auth-profiles.json` file, not via
  environment variables. `openclaw auth login <provider>` sets each one up.
- **No Google AI provider**: Removed the Google/Gemini provider from the initial
  config since the working agent doesn't use it. Can be added later if needed.
- **OpenAI API key for transcription only**: `OPENAI_API_KEY` env var is used
  exclusively for the `gpt-4o-mini-transcribe` audio transcription model, not
  for LLM completions (those go via openai-codex OAuth).
- **Response prefix**: Added `messages.responsePrefix: "[{provider}/{model}]\n\n"`
  so Telegram messages show which model responded.
- **Health check placement**: Registered inside `model-router` plugin. Now
  checks 4 providers: anthropic, openai-codex, github-copilot,
  openai-transcription.
- **207 on partial failure**: If any provider is unreachable the route returns
  HTTP 207 (Multi-Status) so callers can distinguish "all ok" (200) from
  "partially degraded" (207) without masking failures with 500.

## Implementation

### D1: Auth profiles and model providers
Added to `openclaw.docker.json`:
- `auth.profiles` section with three profiles matching the working agent
- `models.providers` with `github-copilot` (Copilot proxy) custom provider
- `tools.media.audio` config for `gpt-4o-mini-transcribe` transcription
- `messages.responsePrefix` and `messages.ackReactionScope`

Three auth profiles:
1. **anthropic:default** — mode: token (API key stored in auth-profiles.json)
2. **openai-codex:default** — mode: oauth (JWT + refresh token from auth.openai.com)
3. **github-copilot:github** — mode: token (GitHub user token for Copilot proxy)

### D2: Environment variables
Updated `.env.docker.example`:
- `OPENAI_API_KEY` — only for audio transcription
- `GITHUB_TOKEN` — for VCS and health checks
- Removed `ANTHROPIC_API_KEY` and `GOOGLE_AI_API_KEY` (auth is via profiles)
- Added `HEALTH_CHECK_SECRET` (optional)

### D3: Default fallback chain
```json
{
  "primary": "anthropic/claude-sonnet-4-6",
  "fallbacks": ["openai-codex/gpt-5.2", "github-copilot/gpt-4o"]
}
```

Per-agent overrides implemented in Task 0038: PM→gpt-5.2, TL→opus-4-6,
PO→gpt-4.1, Designer→gpt-4o.

### D4: Provider health check route
Updated `extensions/model-router/src/provider-health.ts`:
- Now checks 4 providers: anthropic, openai-codex, github-copilot,
  openai-transcription
- GitHub Copilot health check hits `api.individual.githubcopilot.com`
- Comments updated to explain each provider's auth mode

### Telegram channel config
Updated to match working agent's native structure:
```json
{
  "telegram": {
    "enabled": true,
    "botToken": "${TELEGRAM_BOT_TOKEN}",
    "dmPolicy": "pairing",
    "groupPolicy": "allowlist",
    "streamMode": "partial"
  }
}
```

Also enabled the native `telegram` plugin in `plugins.entries`.

## Commands Run
```bash
pnpm typecheck   # clean
pnpm lint        # clean
pnpm test        # 614 tests passing
```

## Files Changed
- `openclaw.docker.json` — auth profiles, model providers, audio config,
  Telegram channel, response prefix, agent model chains, native telegram plugin
- `.env.docker.example` — updated for auth-profile model, removed unused keys
- `extensions/model-router/src/provider-health.ts` — updated provider list
  (4 providers instead of 3)
- `extensions/model-router/src/index.ts` — updated comments for auth-profile model
- `docs/tasks/0036-multi-model-provider-config.md` — updated context, deliverables,
  acceptance criteria, technical notes
- `docs/walkthroughs/0036-multi-model-provider-config.md` — this file

## Follow-ups
- Run `openclaw auth login` for each provider on first deployment
- Verify exact model IDs against provider APIs at deployment time
- Per-agent model differentiation implemented in Task 0038
