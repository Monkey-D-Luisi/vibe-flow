# Code Review CR-0201 — PR #201 Review Findings

## Summary
Addressed 14 review comments from gemini-code-assist and GitHub Copilot on
PR #201 (fix/task-0036-auth-profile-realign).

## Findings Classification

### MUST_FIX (applied)
1. **Health check auth mismatch** — `openai-codex` and `github-copilot` health
   checks were using wrong env vars (`OPENAI_API_KEY` and `GITHUB_TOKEN`).
   Since reachability-only checks need no auth (401 = server reachable),
   changed `authHeaders` to return empty objects.
2. **Provider count "5" → "4"** — Task 0038 testing plan said "all 5 providers"
   but implementation has 4. Fixed to match.
3. **`.env.docker.example` config reference** — Referenced `openclaw.json`
   instead of `openclaw.docker.json`. Fixed.
4. **Task 0038 Goal contradiction** — Goal mentioned implementing
   `before_model_resolve` hook, but D2 says it's not needed. Clarified hook
   is out of scope for this task.
5. **Anthropic auth description** — Said "API key / OAuth token" but mode is
   just `token`. Tightened to "API token".

### SHOULD_FIX (applied)
6. **Walkthrough 0036 "pending verification"** — Commands were already run;
   updated placeholders with actual results.
7. **Task 0036 copilot-proxy reference** — Mentioned `copilot-proxy` extension
   which doesn't exist in this repo. Changed to "OpenClaw runtime".
8. **Missing plugins.load.paths** — `model-router`, `stitch-bridge`, and
   `team-ui` were in `plugins.entries` but not in `plugins.load.paths`.
   Added all three for consistent plugin discovery.

### OUT_OF_SCOPE (not applied)
- **Remove per-agent model config** (Comment 2) — The per-agent `model` keys
  are intentional: PM, Tech Lead, PO, and Designer each override the default
  chain with different primary models. This is the core feature of commit 4.
  Dev/QA/DevOps agents could technically omit `model` (they match the default),
  but explicit config is clearer and self-documenting.

## Files Changed
- `extensions/model-router/src/provider-health.ts` — empty auth headers for
  openai-codex and github-copilot health checks
- `.env.docker.example` — config file reference and anthropic auth description
- `openclaw.docker.json` — added model-router, stitch-bridge, team-ui to
  plugins.load.paths
- `docs/tasks/0036-multi-model-provider-config.md` — copilot-proxy reference
- `docs/tasks/0038-agent-roster-model-routing.md` — goal clarification, provider
  count fix
- `docs/walkthroughs/0036-multi-model-provider-config.md` — pending verification
  placeholders
