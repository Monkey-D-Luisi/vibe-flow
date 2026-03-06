# OpenClaw Extensions

Extensions, skills, and quality tooling for [OpenClaw](https://openclaw.ai).

## Overview

This monorepo contains:

- **`extensions/product-team/`**: primary OpenClaw plugin with task lifecycle, workflow orchestration, quality tooling, and VCS automation.
- **`extensions/quality-gate/`**: standalone quality engine + CLI (`pnpm q:gate`, `pnpm q:*`) used for local/CI quality runs.
- **`extensions/model-router/`**: per-agent model routing hook.
- **`extensions/telegram-notifier/`**: Telegram notification integration.
- **`extensions/stitch-bridge/`**: Google Stitch MCP design bridge.
- **`packages/quality-contracts/`**: shared parsers, gate policy, complexity analysis, and validation contracts.
- **`skills/`**: role-focused skills used by OpenClaw agents.

## Architecture Overview

```mermaid
flowchart LR
  AG[Role Agents] --> OC[OpenClaw Gateway]
  OC --> PT[product-team plugin]
  OC --> MR[model-router hook]
  OC --> TN[telegram-notifier]
  OC --> SB[stitch-bridge]
  PT --> DB[(SQLite task DB)]
  PT --> GH[GitHub via gh CLI]
  CI[Local/CI pipeline] --> QG[quality-gate CLI]
```

## Prerequisites

- [OpenClaw](https://openclaw.ai)
- Node.js 22+
- pnpm

## Quick Start

```bash
git clone https://github.com/Monkey-D-Luisi/vibe-flow.git
cd vibe-flow
pnpm install
pnpm test
```

## Development

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

## Project Structure

```
vibe-flow/
  .agent.md                 # Governance and execution contract
  .agent/rules/             # Workflow rules (next task, review, PR, audits)
  .agent/templates/         # Templates for tasks, walkthroughs, and reviews
  AGENTS.md                 # Generic multi-agent operating instructions
  CLAUDE.md                 # Claude-focused operating instructions
  openclaw.json             # OpenClaw runtime configuration
  extensions/               # OpenClaw plugins and quality CLI package
    product-team/
      src/
        domain/             # Task and workflow domain model
        orchestrator/       # State machine, transitions, guard enforcement
        persistence/        # SQLite repositories and migrations
        quality/            # Runtime quality logic used by product-team tools
        github/             # GitHub integration via gh CLI
        tools/              # Registered OpenClaw tools (task/workflow/quality/vcs)
      test/
    quality-gate/
      src/                  # Standalone quality-gate engine
      cli/                  # q:gate / q:* CLI entrypoints
      test/
    model-router/           # Per-agent model routing hook
    telegram-notifier/      # Telegram notification integration
    stitch-bridge/          # Google Stitch MCP design bridge
  packages/                 # Shared packages
    quality-contracts/      # Shared parsers, gate policy, complexity analysis, validation contracts
  skills/                   # Role skills loaded by OpenClaw
    adr/
    architecture-design/
    backend-dev/
    code-review/
    devops/
    frontend-dev/
    github-automation/
    patterns/
    product-owner/
    qa-testing/
    requirements-grooming/
    tdd-implementation/
    tech-lead/
    ui-designer/
  docs/                     # Product, operations, and execution documentation
    roadmap.md              # Status and execution queue
    runbook.md              # Operator setup and troubleshooting
    api-reference.md        # Tool-by-tool contract reference
    allowlist-rationale.md  # Agent-tool access justifications
    extension-integration.md
    error-recovery.md
    transition-guard-evidence.md
    adr/
    audits/
    backlog/
    tasks/
    walkthroughs/
```

## Landing Page (GitHub Pages)

The `site/` directory contains a static landing page that is deployed via GitHub Pages.

**Live site:** https://monkey-d-luisi.github.io/vibe-flow/

### Enabling GitHub Pages

If you fork this repo, enable Pages in **Settings → Pages**:

- **Source**: GitHub Actions (recommended — uses `.github/workflows/deploy-pages.yml`)
- Alternatively: set **Source** to `Deploy from a branch`, branch `main`, folder `/site`

The deployment workflow runs automatically on every push to `main` that touches `site/**`.

### HTML validation

Every PR that changes `site/` runs `.github/workflows/validate-html.yml`, which validates
`site/index.html` using [html-validate](https://html-validate.org/). Config lives in `.htmlvalidate.json`.

To run locally:

```bash
npx html-validate site/index.html
```

### Custom domain (optional)

To use a custom domain:

1. Copy `site/CNAME.example` → `site/CNAME` (no extension)
2. Set the file content to your domain (e.g. `vibe-flow.example.com`)
3. Add a CNAME DNS record pointing to `monkey-d-luisi.github.io`
4. Enable **Enforce HTTPS** in repo Settings → Pages

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
