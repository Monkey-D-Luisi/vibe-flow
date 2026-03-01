# Open Issues Intake (Unscheduled)

| Field | Value |
|-------|-------|
| Source | GitHub Project board + open issue triage |
| Updated | 2026-03-01 |
| Status | PLANNED (not in active task queue) |

## Purpose

Track board issues that are not yet represented as active task specs in
`docs/roadmap.md` so scope is not lost while preserving the current execution
queue for AR01 remediation.

## Intake items

| Issue | Title | Proposed Track | Current Mapping | Next Step to Activate |
|-------|-------|----------------|-----------------|-----------------------|
| #154 | Gate auto-tuning: adjust thresholds based on historical metrics | EP05 follow-up (quality optimization) | Task `0020` DONE (`docs/tasks/0020-gate-auto-tuning-historical-metrics.md`) | **CLOSED** — GitHub issue closed 2026-03-01. Traceability retained. |
| #155 | Threshold alerts: notify on coverage drops or complexity rises | EP05 follow-up (quality alerting) | Task `0021` DONE (`docs/tasks/0021-threshold-alerts-notify-on-coverage-drops-or-complexity-rises.md`) | **CLOSED** — GitHub issue closed 2026-03-01. Traceability retained. |
| #156 | Extension scaffolding CLI for new OpenClaw plugins | DX track | Not in task specs | Create scoped task for generator CLI architecture and acceptance tests. |
| #157 | npm publish pipeline for @openclaw/* extensions | Release engineering track | Not in task specs | Define release/versioning strategy and CI publish safeguards, then create task spec. |
| #158 | CI: quality gate workflow for pull requests | CI/Quality track | Partially related to `0015` but not fully covered | Decide if it belongs under AR01 or post-AR backlog, then create explicit task spec for PR quality-gate workflow and comment upsert behavior. |

## Activation policy

1. Do not treat this file as active execution queue.
2. Promote items into `docs/tasks/NNNN-*.md` only after explicit prioritization.
3. Keep issue-to-task traceability by adding issue references in new task specs.
