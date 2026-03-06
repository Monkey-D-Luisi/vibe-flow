# Product-Team Runbook

## Purpose

Operate and troubleshoot the `@openclaw/product-team` extension safely in
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

> **Note:** Tool names use underscore notation at runtime (e.g., `task_create`),
> matching the registered tool names in CLAUDE.md. Dots are rewritten to
> underscores by the OpenClaw plugin registration system.

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
          },
          "orchestrator": {
            "maxRetriesPerStage": 1,
            "stageTimeouts": { "dev": 1800000, "review": 600000 },
            "skipDesignForNonUITasks": false,
            "autoEscalateAfterRetries": true,
            "notifyTelegramOnStageChange": false
          },
          "projects": [
            {
              "id": "my-project",
              "name": "My Project",
              "repo": "org/repo",
              "workspace": "/workspaces/project"
            }
          ],
          "activeProject": "my-project",
          "delivery": {
            "default": {
              "mode": "smart",
              "broadcastKeywords": ["deploy", "release"]
            },
            "agents": {},
            "agentAccounts": {}
          },
          "decisions": {
            "policies": {},
            "timeoutMs": 300000,
            "humanApprovalTimeout": 600000
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

- No required plugin-specific environment variables for local-only use.
- If CI webhook feedback is enabled, inject `github.ciFeedback.webhookSecret`
  from a secure runtime secret source; do not commit real secret values.
- `gh` CLI can use `GH_TOKEN` in non-interactive environments.
- Do not store tokens/secrets in task metadata or logs.

For Docker deployments, the following env vars are required in `.env.docker`:

- `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` -- VCS operations
- `GITHUB_WEBHOOK_SECRET` -- CI feedback webhook (when `ciFeedback.enabled=true`)
- `TELEGRAM_BOT_TOKEN_PM`, `TELEGRAM_BOT_TOKEN_TL`, `TELEGRAM_BOT_TOKEN_DESIGNER` -- 3 Telegram bot tokens (one per persona)
- `TELEGRAM_GROUP_ID` -- Telegram group (prefix `-100` to the raw ID)
- `HEALTH_CHECK_SECRET` -- optional health endpoint auth
- `OPENCLAW_GATEWAY_TOKEN` -- gateway LAN bind auth

See `.env.docker.example` for the full template.

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

### Task management (EP01-EP03)

1. Create/update tasks with `task_create`, `task_update`, `task_transition`.
2. Capture quality evidence with `quality_coverage`, `quality_lint`,
   `quality_complexity`, and `quality_tests`. Use `quality_gate` for an
   explicit quality verdict snapshot. For adaptive thresholds, call
   `quality_gate` with `autoTune.enabled=true` and bounded safeguards
   (`minSamples`, `smoothingFactor`, `maxDeltas`, `bounds`). For regression
   notifications, enable `alerts.enabled=true` and configure
   `alerts.thresholds.coverageDropPct`, `alerts.thresholds.complexityRise`, and
   optional `alerts.noise.cooldownEvents`.
3. Use `workflow_step_run` for role outputs (`architecture_plan`,
   `dev_result`, `review_result`, `qa_report`) when transitions require
   structured evidence beyond quality metrics.
4. Inspect lifecycle and events with `workflow_state_get`,
   `workflow_events_query`.
5. Use infra VCS tools (`vcs_branch_create`, `vcs_pr_create`,
   `vcs_pr_update`, `vcs_label_sync`) from infra agent context.

### Team messaging (EP06)

6. Post messages with `team_message`. Read inbox with `team_inbox`.
   Reply to a thread with `team_reply`.
7. Update agent status with `team_status`.
8. Assign work to agents with `team_assign`.

### Decision engine (EP07)

9. Evaluate decisions with `decision_evaluate`. Log decisions with
   `decision_log`. Tag completed task decisions with `decision_outcome`.

### Multi-project management (EP08)

10. List projects with `project_list`. Switch active project with
    `project_switch`. Register new projects with `project_register`.

### Pipeline intelligence (EP09)

11. Start pipelines with `pipeline_start`. Check status with
    `pipeline_status`. Retry failed steps with `pipeline_retry`.
12. Skip a step with `pipeline_skip`. Advance to next stage with
    `pipeline_advance`. Query metrics with `pipeline_metrics`.
    View a per-task stage timeline with `pipeline_timeline`.

## Troubleshooting

### Database path rejected (`escapes workspace root`)

- Ensure `plugins.entries.product-team.config.dbPath` resolves inside workspace.
- Use a relative path such as `./data/product-team.db`.

### SQLite lock contention

- Retry after current operation completes.
- Check for long-running processes holding the DB file.
- Restart runtime to close stale handles if needed.

### Transition guard failures

- Use `workflow_state_get` and review guard matrix + metadata requirements.
- Run missing quality tools and re-attempt `task_transition`.

### Budget warnings (`cost.warning` events)

- Inspect `task_get` `costSummary`.
- Increase `metadata.budget.maxTokens` or `metadata.budget.maxDurationMs` via
  `task_update` if warnings are expected for this task.

### Quality regression alerts

- Review `quality_gate` result `output.alerts` for emitted coverage-drop and
  complexity-rise alerts.
- Use `result.alerting.baseline` to understand comparison inputs and
  `result.alerting.suppressed` for dedupe/noise decisions.
- Increase thresholds or cooldown events if repeated low-signal alerts are
  expected for the task scope.

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

1. Query task history with `workflow_events_query` to identify last valid state.
2. If metadata is invalid, repair with `task_update` at current revision.
3. Re-run blocked workflow step and transition.
4. For persistent DB corruption or migration issues, restore DB from backup and
   replay task events through automation.
