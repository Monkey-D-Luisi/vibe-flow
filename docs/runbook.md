# Product-Team Runbook

## Purpose

Operate and troubleshoot the `@openclaw/plugin-product-team` extension safely in
local and CI environments.

## Prerequisites

- Node.js 22+
- pnpm 10+
- OpenClaw runtime installed
- `gh` CLI authenticated (`gh auth status`) for VCS tools

## Installation

```bash
pnpm install
```

## Configuration

Configuration lives in `openclaw.json`.

### Plugin configuration

```json
{
  "plugins": {
    "entries": {
      "product-team": {
        "enabled": true,
        "config": {
          "dbPath": "./data/product-team.db",
          "github": {
            "owner": "org-or-user",
            "repo": "repo-name",
            "defaultBase": "main",
            "timeoutMs": 30000
          },
          "workflow": {
            "transitionGuards": {
              "coverage": {
                "major": 80,
                "minor": 70,
                "patch": 70
              },
              "maxReviewRounds": 3
            },
            "concurrency": {
              "maxLeasesPerAgent": 3,
              "maxTotalLeases": 10
            }
          }
        }
      }
    }
  }
}
```

### Environment variables

- No required plugin-specific environment variables.
- `gh` CLI can use `GH_TOKEN` in non-interactive environments.
- Do not store tokens/secrets in task metadata or logs.

## Operational Checks

```bash
pnpm tsx scripts/validate-allowlists.ts
pnpm test
pnpm lint
pnpm typecheck
```

## Tool Allow-Lists

- Allow-list justifications are documented in `docs/allowlist-rationale.md`.
- CI enforces allow-lists via `scripts/validate-allowlists.ts`.

## Routine Operations

1. Create/update tasks with `task.create`, `task.update`, `task.transition`.
2. Capture quality evidence with `quality.coverage`, `quality.lint`,
   `quality.complexity`, `quality.tests`, then evaluate `quality.gate`.
3. Inspect lifecycle and events with `workflow.state.get`,
   `workflow.events.query`.
4. Use infra VCS tools (`vcs.branch.create`, `vcs.pr.create`,
   `vcs.pr.update`, `vcs.label.sync`) from infra agent context.

## Troubleshooting

### Database path rejected (`escapes workspace root`)

- Ensure `plugins.entries.product-team.config.dbPath` resolves inside workspace.
- Use a relative path such as `./data/product-team.db`.

### SQLite lock contention

- Retry after current operation completes.
- Check for long-running processes holding the DB file.
- Restart runtime to close stale handles if needed.

### Transition guard failures

- Use `workflow.state.get` and review guard matrix + metadata requirements.
- Run missing quality tools and re-attempt `task.transition`.

### Budget warnings (`cost.warning` events)

- Inspect `task.get` `costSummary`.
- Increase `metadata.budget.maxTokens` or `metadata.budget.maxDurationMs` via
  `task.update` if warnings are expected for this task.

### Allow-list validation failures

- Verify each `agents.list[*].tools.allow` entry is a registered tool name.
- Ensure role/tool combinations match `docs/allowlist-rationale.md`.

### GitHub command failures

- Verify auth: `gh auth status`.
- Confirm repo owner/name in plugin config.
- Re-run infra VCS action; operations are idempotent.

## Recovery

1. Query task history with `workflow.events.query` to identify last valid state.
2. If metadata is invalid, repair with `task.update` at current revision.
3. Re-run blocked workflow step and transition.
4. For persistent DB corruption or migration issues, restore DB from backup and
   replay task events through automation.
