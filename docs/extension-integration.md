# Extension Integration Patterns

How `extensions/product-team` and `extensions/quality-gate` coexist in the
current architecture.

## Current Topology

```
OpenClaw Gateway
  -> product-team plugin (runtime plugin loaded from openclaw.json)
      -> Task lifecycle tools (task.*)
      -> Workflow tools (workflow.*)
      -> Quality tools (quality.*)
      -> VCS tools (vcs.*)
      -> SQLite persistence + event log

Local/CI Shell
  -> quality-gate CLI (pnpm q:gate / pnpm q:tests / pnpm q:coverage / ...)
      -> standalone quality execution against workspace artifacts
```

`openclaw.json` loads only `extensions/product-team`.
`extensions/quality-gate` remains a standalone CLI/engine package and is not
loaded as a runtime plugin in the default gateway config.

## Responsibility Split

| Area | product-team | quality-gate |
|---|---|---|
| OpenClaw runtime tools | Yes | No (default config) |
| Task metadata writes | Yes | No |
| Transition guard support | Yes | No |
| Standalone quality CLI | No | Yes |
| Local/CI command wrappers (`pnpm q:*`) | Delegates to quality-gate | Yes |

## Metadata Integration (Runtime)

In `product-team`, quality tools write directly into `TaskRecord.metadata`:

- `quality.tests` -> `metadata.qa_report` and `metadata.quality.tests`
- `quality.coverage` -> `metadata.dev_result.metrics.coverage` and `metadata.quality.coverage`
- `quality.lint` -> `metadata.dev_result.metrics.lint_clean` and `metadata.quality.lint`
- `quality.complexity` -> `metadata.complexity` and `metadata.quality.complexity`
- `quality.gate` -> `metadata.quality.gate`

This removes manual copy steps between quality execution and transition guard
evaluation.

## Guard-Evidence Interaction

Transition guards evaluate task metadata directly:

- `design -> in_progress` reads `architecture_plan`
- `in_progress -> in_review` reads `dev_result.metrics.*` plus `red_green_refactor_log`
- `in_review -> qa` reads `review_result`
- `qa -> done` reads `qa_report`

Quality tools provide metrics fields; role outputs are provided through
`workflow.step.run` (or `task.update` where appropriate).

## Operational Guidance

Use `product-team` quality tools when evidence must be persisted to tasks and
used by guards.

Use `quality-gate` CLI when you need standalone quality execution in local/CI
pipelines without task-engine state.
