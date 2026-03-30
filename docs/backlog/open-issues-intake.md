# Open Issues Intake (Unscheduled)

| Field | Value |
|-------|-------|
| Source | GitHub Project board + open issue triage |
| Updated | 2026-03-01 |
| Status | ALL ITEMS ADDRESSED (2026-03-01) |

## Purpose

Track board issues that are not yet represented as active task specs in
`docs/roadmap_mvp.md` so scope is not lost while preserving the current execution
queue for AR01 remediation.

## Intake items

| Issue | Title | Proposed Track | Current Mapping | Next Step to Activate |
|-------|-------|----------------|-----------------|-----------------------|
| #144 | 4.4 CI webhook feedback | EP04 GitHub Integration | Task `0009` DONE (`docs/tasks/0009-ci-webhook-feedback.md`) | **CLOSED** — PR #169 merged 2026-02-25. GitHub issue closed 2026-03-01. Traceability retained. |
| #154 | Gate auto-tuning: adjust thresholds based on historical metrics | EP05 follow-up (quality optimization) | Task `0020` DONE (`docs/tasks/0020-gate-auto-tuning-historical-metrics.md`) | **CLOSED** — GitHub issue closed 2026-03-01. Traceability retained. |
| #155 | Threshold alerts: notify on coverage drops or complexity rises | EP05 follow-up (quality alerting) | Task `0021` DONE (`docs/tasks/0021-threshold-alerts-notify-on-coverage-drops-or-complexity-rises.md`) | **CLOSED** — GitHub issue closed 2026-03-01. Traceability retained. |
| #156 | Extension scaffolding CLI for new OpenClaw plugins | DX track | Task `0032` PENDING (`docs/tasks/0032-extension-scaffolding-cli.md`) | **ACTIVATED** — Task spec created 2026-03-01. Added to roadmap under EP07. |
| #157 | npm publish pipeline for @openclaw/* extensions | Release engineering track | Task `0033` PENDING (`docs/tasks/0033-npm-publish-pipeline.md`) | **ACTIVATED** — Task spec created 2026-03-01. Added to roadmap under EP07. |
| #158 | CI: quality gate workflow for pull requests | CI/Quality track | Task `0034` PENDING (`docs/tasks/0034-ci-quality-gate-workflow-for-prs.md`) | **ACTIVATED** — Task spec created 2026-03-01. Placed under EP07 (not AR01). Added to roadmap. |

## Activation policy

1. Do not treat this file as active execution queue.
2. Promote items into `docs/tasks/NNNN-*.md` only after explicit prioritization.
3. Keep issue-to-task traceability by adding issue references in new task specs.
