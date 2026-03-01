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

Configure the OpenClaw gateway with four LLM providers (OpenAI, Anthropic,
Google, GitHub Copilot) and define the model catalog with fallback chains that
each agent role will use.

## Context

The user has:
- API keys for OpenAI, Anthropic, and Google AI
- GitHub Copilot subscription (free models like GPT 4.1 via Copilot proxy)
- An existing OpenClaw instance using Claude OAuth + GPT OAuth + Copilot fallback

The Docker instance needs its own provider configuration. Authentication method
will be determined during implementation (API keys preferred for Docker
simplicity; OAuth possible if the SDK supports headless OAuth flows).

## Deliverables

### D1: Provider Configuration Block

Add to `openclaw.docker.json` the `models.providers` section:

```jsonc
{
  "models": {
    "mode": "merge",
    "providers": {
      "openai": {
        "baseUrl": "https://api.openai.com/v1",
        "auth": "api-key",
        "models": [
          {
            "id": "openai/gpt-5.3",
            "name": "GPT 5.3",
            "api": "openai-responses",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 2.0, "output": 8.0, "cacheRead": 0.5, "cacheWrite": 2.0 },
            "contextWindow": 256000,
            "maxTokens": 32768
          },
          {
            "id": "openai/gpt-4.1",
            "name": "GPT 4.1",
            "api": "openai-responses",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 1.0, "output": 4.0, "cacheRead": 0.25, "cacheWrite": 1.0 },
            "contextWindow": 1048576,
            "maxTokens": 32768
          }
        ]
      },
      "anthropic": {
        "baseUrl": "https://api.anthropic.com",
        "auth": "api-key",
        "models": [
          {
            "id": "anthropic/claude-opus-4.6",
            "name": "Claude Opus 4.6",
            "api": "anthropic-messages",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 15.0, "output": 75.0, "cacheRead": 1.5, "cacheWrite": 18.75 },
            "contextWindow": 200000,
            "maxTokens": 32000
          },
          {
            "id": "anthropic/claude-sonnet-4.6",
            "name": "Claude Sonnet 4.6",
            "api": "anthropic-messages",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 3.0, "output": 15.0, "cacheRead": 0.3, "cacheWrite": 3.75 },
            "contextWindow": 200000,
            "maxTokens": 16000
          }
        ]
      },
      "google": {
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
        "auth": "api-key",
        "models": [
          {
            "id": "google/gemini-3-pro",
            "name": "Gemini 3 Pro",
            "api": "google-generative-ai",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 1.25, "output": 10.0, "cacheRead": 0.315, "cacheWrite": 1.25 },
            "contextWindow": 1000000,
            "maxTokens": 65536
          }
        ]
      }
    }
  }
}
```

### D2: Environment Variable Mapping

```env
# .env.docker
OPENAI_API_KEY=<placeholder>
ANTHROPIC_API_KEY=<placeholder>
GOOGLE_AI_API_KEY=<placeholder>
GITHUB_TOKEN=<placeholder>
```

### D3: Model Assignment Table (input for Task 0038)

| Agent ID    | Primary Model               | Fallback 1                    | Fallback 2       |
|-------------|-----------------------------|-------------------------------|------------------|
| `pm`        | `openai/gpt-5.3`            | `anthropic/claude-opus-4.6`   | `openai/gpt-4.1` |
| `tech-lead` | `anthropic/claude-opus-4.6`  | `openai/gpt-5.3`             | —                |
| `po`        | `openai/gpt-4.1`            | `google/gemini-3-pro`         | —                |
| `designer`  | `google/gemini-3-pro`        | `openai/gpt-4.1`             | —                |
| `back-1`    | `anthropic/claude-sonnet-4.6`| `openai/gpt-4.1`             | —                |
| `back-2`    | `anthropic/claude-sonnet-4.6`| `openai/gpt-4.1`             | —                |
| `front-1`   | `anthropic/claude-sonnet-4.6`| `openai/gpt-4.1`             | —                |
| `front-2`   | `anthropic/claude-sonnet-4.6`| `openai/gpt-4.1`             | —                |
| `qa`        | `anthropic/claude-sonnet-4.6`| `openai/gpt-4.1`             | —                |
| `devops`    | `anthropic/claude-sonnet-4.6`| `openai/gpt-4.1`             | —                |

### D4: Provider Health Check

Register an HTTP route `/api/providers/health` that tests connectivity to each
provider's API and reports status. Used by the Telegram health monitor.

## Acceptance Criteria

- [x] All four providers are configured in `openclaw.docker.json`
- [x] Each provider authenticates successfully (verified by health check)
- [x] Model definitions include correct API type, costs, and context windows
- [x] Fallback chains are defined for every agent
- [x] Provider health check route returns status for all providers
- [x] API keys are read from environment variables (never hardcoded)
- [x] Cost tracking from EP06 still works with the new providers

## Testing Plan

1. Start Docker container with valid API keys
2. Call provider health check: `GET /api/providers/health`
3. Verify each provider returns `connected: true`
4. Test fallback: intentionally break primary provider key, verify fallback activates
5. Verify cost tracking logs include per-provider cost data

## Technical Notes

- The exact model IDs (gpt-5.3, opus-4.6, gemini-3-pro) may differ from what
  the API providers expose. Verify against latest API docs during implementation.
- For OAuth-based auth: the `before_model_resolve` hook or provider plugin can
  handle token refresh. API keys are simpler for Docker; defer OAuth to follow-up.
- Cost figures in the model definitions are per million tokens. Verify against
  current pricing at implementation time.
