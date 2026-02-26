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
            "timeoutMs": 30000,
            "prBot": {
              "enabled": true,
              "reviewers": {
                "default": ["infra-reviewer"],
                "major": ["architect-reviewer"],
                "minor": [],
                "patch": []
              }
            },
            "ciFeedback": {
              "enabled": false,
              "routePath": "/webhooks/github/ci",
              "webhookSecret": "<github-webhook-secret>",
              "commentOnPr": true,
              "autoTransition": {
                "enabled": false,
                "toStatus": "qa",
                "agentId": "infra"
              }
            }
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

Canonical workflow settings are under `plugins.entries.product-team.config.workflow`.
Root-level `concurrency` keys are not part of the plugin config contract.
`ciFeedback.expectedRepository` is derived internally from `github.owner/repo`.
When `github.ciFeedback.enabled=true`, `github.ciFeedback.webhookSecret` is required.

### Environment variables

- No required plugin-specific environment variables.
- If CI webhook feedback is enabled, inject `github.ciFeedback.webhookSecret`
  from a secure runtime secret source; do not commit real secret values.
- `gh` CLI can use `GH_TOKEN` in non-interactive environments.
- Do not store tokens/secrets in task metadata or logs.

## Operational Checks

```bash
pnpm tsx scripts/validate-allowlists.ts
pnpm verify:vuln-policy
pnpm test
pnpm lint
pnpm typecheck
```

### Security exception ledger checks

Track and revalidate active transitive vulnerability exceptions using the
canonical procedure in `docs/security-vulnerability-exception-ledger.md`
(`Revalidation Procedure` section).

### CI vulnerability gate policy

CI enforces vulnerability policy through `pnpm verify:vuln-policy`.

- The gate runs `pnpm audit --prod --json`.
- Any `high` or `critical` finding must match an active exception row in
  `docs/security-vulnerability-exception-ledger.md`.
- Exception matching is strict by advisory (`GHSA-*`), package, installed
  version, and dependency path.
- Expired exceptions fail the gate even when still listed.

## Tool Allow-Lists

- Allow-list justifications are documented in `docs/allowlist-rationale.md`.
- CI enforces allow-lists via `scripts/validate-allowlists.ts`.

## Routine Operations

1. Create/update tasks with `task.create`, `task.update`, `task.transition`.
2. Capture quality evidence with `quality.coverage`, `quality.lint`,
   `quality.complexity`, and `quality.tests`. Use `quality.gate` for an
   explicit quality verdict snapshot.
3. Use `workflow.step.run` for role outputs (`architecture_plan`,
   `dev_result`, `review_result`, `qa_report`) when transitions require
   structured evidence beyond quality metrics.
4. Inspect lifecycle and events with `workflow.state.get`,
   `workflow.events.query`.
5. Use infra VCS tools (`vcs.branch.create`, `vcs.pr.create`,
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

### CI feedback webhook issues

- Confirm `github.ciFeedback.enabled=true`.
- Verify route path (`github.ciFeedback.routePath`) matches gateway routing.
- Ensure `github.ciFeedback.webhookSecret` matches the GitHub webhook secret.
- Validate event header `x-github-event` is present.
- Validate signature header `x-hub-signature-256` is present and valid.
- Check plugin logs for payload/JSON errors and repository mismatch.

## Recovery

1. Query task history with `workflow.events.query` to identify last valid state.
2. If metadata is invalid, repair with `task.update` at current revision.
3. Re-run blocked workflow step and transition.
4. For persistent DB corruption or migration issues, restore DB from backup and
   replay task events through automation.
