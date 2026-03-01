# Walkthrough 0036 -- Multi-Model Provider Configuration

## Goal (restated)
Configure the OpenClaw gateway with three LLM providers (OpenAI, Anthropic,
Google) and define the model catalog with fallback chains per agent role.
Register the `/api/providers/health` HTTP route for Telegram health monitoring.

## Decisions
- **API key auth (not OAuth)**: Simpler for Docker containers. OAuth requires
  an interactive browser flow which does not work in headless containers. API
  keys are injected via environment variables.
- **No GitHub Copilot provider**: Copilot requires interactive OAuth and is
  designed for IDE integration, not headless containers. GPT-4.1 via direct
  OpenAI API is used instead for the PO role.
- **Cost figures**: Approximate per-million-token costs at time of planning.
  Verify against current pricing before first production deployment.
- **Fallback chains**: Every agent has at least one fallback. PM and Tech Lead
  have two fallbacks each due to their critical pipeline positions.
- **Health check placement**: Registered inside `model-router` plugin (not
  `product-team`) because it is about provider connectivity, not task
  orchestration. HEAD requests used to avoid side effects and token consumption.
- **207 on partial failure**: If any provider is unreachable the route returns
  HTTP 207 (Multi-Status) so callers can distinguish "all ok" (200) from
  "partially degraded" (207) without masking failures with 500.

## Implementation

### D1 + D3: Provider config and agent model assignments
Already present in `openclaw.docker.json` (added in Task 0035).

Three providers:
1. **OpenAI** — GPT 5.3 (PM), GPT 4.1 (PO, fallback for all)
2. **Anthropic** — Opus 4.6 (Tech Lead), Sonnet 4.6 (all devs/QA/DevOps)
3. **Google** — Gemini 3 Pro (Designer)

Model assignment table (primary → fallbacks):

| Agent     | Primary               | Fallbacks              |
|-----------|-----------------------|------------------------|
| pm        | openai/gpt-5.3        | opus-4.6, gpt-4.1      |
| tech-lead | anthropic/opus-4.6    | gpt-5.3                |
| po        | openai/gpt-4.1        | gemini-3-pro           |
| designer  | google/gemini-3-pro   | gpt-4.1                |
| back-*    | anthropic/sonnet-4.6  | gpt-4.1                |
| front-*   | anthropic/sonnet-4.6  | gpt-4.1                |
| qa        | anthropic/sonnet-4.6  | gpt-4.1                |
| devops    | anthropic/sonnet-4.6  | gpt-4.1                |

### D2: Environment variable mapping
Already present in `.env.docker.example` (added in Task 0035):
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `GITHUB_TOKEN`

### D4: Provider health check route
Added `GET /api/providers/health` to the `model-router` plugin:

- `extensions/model-router/src/provider-health.ts` — `registerProviderHealthRoute`
  makes concurrent HEAD requests to each provider's base URL (5 s timeout),
  reads API keys from env vars, returns JSON:
  ```json
  {
    "ok": true,
    "providers": {
      "openai":     { "connected": true, "latencyMs": 120 },
      "anthropic":  { "connected": true, "latencyMs": 45  },
      "google":     { "connected": true, "latencyMs": 88  }
    }
  }
  ```
- `extensions/model-router/src/index.ts` — calls `registerProviderHealthRoute(api)`
  on plugin load.
- `extensions/model-router/test/provider-health.test.ts` — unit tests covering
  route registration path and 405 rejection for non-GET/HEAD verbs.

## Commands Run
```bash
pnpm typecheck   # all 9 packages clean
pnpm lint        # all 9 packages clean
pnpm test        # 405 tests passing (2 new in model-router)
```

## Files Changed
- `extensions/model-router/src/provider-health.ts` — new, health check route
- `extensions/model-router/src/index.ts` — import + call registerProviderHealthRoute
- `extensions/model-router/test/provider-health.test.ts` — new, 2 unit tests
- `docs/tasks/0036-multi-model-provider-config.md` — Status → DONE
- `docs/walkthroughs/0036-multi-model-provider-config.md` — this file
- `docs/roadmap.md` — 0036 PENDING → DONE

## Follow-ups
- Verify exact model IDs against provider APIs at deployment time
- Update cost figures once confirmed with current pricing pages
