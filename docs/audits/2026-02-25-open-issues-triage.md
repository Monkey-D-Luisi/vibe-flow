# Open Issues Triage (2026-02-25)

## Scope

Triage of all GitHub open issues in `Monkey-D-Luisi/vibe-flow` as of
2026-02-25. This document was reconciled later on 2026-02-25 after completion
of EP04 follow-up tasks (`0008`, `0009`) and roadmap/backlog updates.

The goal is to:

1. Close issues with clear completion evidence in the repository.
2. Document issues that remain pending, with concrete reasons and next actions.

## Closed in this triage

The following issues were closed because implementation is already delivered and
documented in DONE task specs/walkthroughs:

- EP03 and its task issues: #123, #137, #138, #139, #140
- EP04 and its task issues: #124, #141, #142, #143, #144
- EP05 and its task issues: #125, #145, #146, #147, #148
- EP06 and its task issues: #126, #149, #150, #151, #152, #153

## Pending open issues

| Issue | Title | Why still pending | Recommended next action |
|-------|-------|-------------------|-------------------------|
| #154 | Gate auto-tuning: adjust thresholds based on historical metrics | Future enhancement; no implementation in current EP05/EP06 delivery scope. | Keep in backlog as a post-EP06 optimization task. |
| #155 | Threshold alerts: notify on coverage drops or complexity rises | Future enhancement; no implemented alerting workflow yet. | Keep in backlog and define alert transport + baseline policy before implementation. |
| #156 | Extension scaffolding CLI for new OpenClaw plugins | Not implemented in current roadmap tasks. | Schedule as developer-experience task with generator CLI scope and acceptance tests. |
| #157 | npm publish pipeline for @openclaw/* extensions | Not implemented in current repo workflows. | Plan release automation task (build artifacts, tagging strategy, npm publish workflow). |
| #158 | CI: quality gate workflow for pull requests | Not implemented as described. Current `.github/workflows/ci.yml` runs lint/typecheck/test but does not post gate comments or run full quality gate summary workflow. | Add dedicated PR quality-gate workflow with comment upsert behavior. |

## Mapping evidence for EP04 reconciliation

- `docs/tasks/0008-pr-bot-skill.md` -> issue #143 (`4.3`) delivered, status DONE.
- `docs/tasks/0009-ci-webhook-feedback.md` -> issue #144 (`4.4`) delivered, status DONE.
- `docs/backlog/EP04-github-integration.md` marks `4.3` and `4.4` as DONE.
- `docs/roadmap.md` marks EP04 as DONE and includes tasks `0008` and `0009` as DONE.

## Backlog intake for remaining board issues

Unscheduled issues #154-#158 are now tracked in
`docs/backlog/open-issues-intake.md` as canonical backlog intake items.

## Notes

- If a board card still shows #143 or #144 as TODO, sync board status with the
  delivered repository state (`0008`/`0009`).
- Do not add #154-#158 to the active task queue until they are explicitly
  prioritized and scoped into task specs.
