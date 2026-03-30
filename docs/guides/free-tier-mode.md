# Free-Tier Mode Guide

## Overview

vibe-flow can run entirely on **free GitHub Copilot models**, requiring no paid API keys. This mode is ideal for evaluation, learning, and small projects.

## How It Works

When you run `npx create-vibe-flow my-project` without any API keys configured, the CLI automatically detects free-tier mode and configures all agents to use `github-copilot/gpt-4o`.

### What's Different

| Feature | Free Tier | Mixed/Premium |
|---------|-----------|---------------|
| Models | GitHub Copilot only | Anthropic/OpenAI |
| Coverage threshold (minor) | 60% | 70% |
| Coverage threshold (major) | 70% | 80% |
| Max complexity | 6.0 | 5.0 |
| Model router | Disabled | Enabled |
| Cost | $0 | Varies |

### Quality Expectations

Free-tier models work well for:
- Simple features and bug fixes
- CRUD operations
- Documentation tasks
- Straightforward refactoring

For complex architectural tasks, paid models produce significantly better results.

## Upgrading to Paid Models

1. Set your API key:
   ```bash
   # In your project's .env file
   ANTHROPIC_API_KEY=sk-ant-...
   # OR
   OPENAI_API_KEY=sk-...
   ```

2. Update your `openclaw.json` agent models section to use the paid model IDs.

3. Re-enable the model router if desired:
   ```json
   {
     "extensions": {
       "@openclaw/model-router": { "enabled": true }
     }
   }
   ```

## Model Tiers

| Tier | Models | Best For |
|------|--------|----------|
| **Free** | `github-copilot/gpt-4o` | Evaluation, learning, small projects |
| **Mixed** | Copilot + one paid provider | Balanced cost/quality for real projects |
| **Premium** | Anthropic Claude / OpenAI GPT-4o | Production workloads, complex features |

## CLI Auto-Detection

The CLI checks these environment variables to auto-select the model tier:

- `ANTHROPIC_API_KEY` → enables Anthropic models
- `OPENAI_API_KEY` → enables OpenAI models
- Neither set → free tier (Copilot only)

Override with `--model free|mixed|premium`:
```bash
npx create-vibe-flow my-project --model free    # force free tier
npx create-vibe-flow my-project --model premium  # force premium
```
