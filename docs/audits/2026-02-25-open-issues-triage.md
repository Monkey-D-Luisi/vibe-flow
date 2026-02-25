# Open Issues Triage (2026-02-25)

## Scope

Triage of all GitHub open issues in `Monkey-D-Luisi/vibe-flow` as of
2026-02-25. The goal was to:

1. Close issues with clear completion evidence in the repository.
2. Document issues that remain pending, with concrete reasons and next actions.

## Closed in this triage

The following issues were closed because implementation is already delivered and
documented in DONE task specs/walkthroughs:

- EP03 and its task issues: #123, #137, #138, #139, #140
- EP05 and its task issues: #125, #145, #146, #147, #148
- EP06 and its task issues: #126, #149, #150, #151, #152, #153
- EP04 completed sub-scope: #141, #142

## Pending open issues

| Issue | Title | Why still pending | Recommended next action |
|-------|-------|-------------------|-------------------------|
| #124 | EP04: GitHub Integration | Epic still has unfinished sub-issues (#143, #144). Task `0005` explicitly marked PR-Bot automation and CI webhook listener as out of scope. | Keep open until #143 and #144 are delivered, then close epic. |
| #143 | 4.3 PR-Bot skill | Not implemented. `docs/tasks/0005-github-integration.md` lists PR-Bot skill automation as out of scope. | Create/execute a dedicated EP04 follow-up task for PR-Bot skill integration. |
| #144 | 4.4 CI webhook feedback | Not implemented. `docs/tasks/0005-github-integration.md` lists CI webhook listener as out of scope. | Create/execute a dedicated EP04 follow-up task for CI status feedback into task lifecycle. |
| #154 | Gate auto-tuning: adjust thresholds based on historical metrics | Future enhancement; no implementation in current EP05/EP06 delivery scope. | Keep in backlog as a post-EP06 optimization task. |
| #155 | Threshold alerts: notify on coverage drops or complexity rises | Future enhancement; no implemented alerting workflow yet. | Keep in backlog and define alert transport + baseline policy before implementation. |
| #156 | Extension scaffolding CLI for new OpenClaw plugins | Not implemented in current roadmap tasks. | Schedule as developer-experience task with generator CLI scope and acceptance tests. |
| #157 | npm publish pipeline for @openclaw/* extensions | Not implemented in current repo workflows. | Plan release automation task (build artifacts, tagging strategy, npm publish workflow). |
| #158 | CI: quality gate workflow for pull requests | Not implemented as described. Current `.github/workflows/ci.yml` runs lint/typecheck/test but does not post gate comments or run full quality gate summary workflow. | Add dedicated PR quality-gate workflow with comment upsert behavior. |

## Notes

- This triage intentionally keeps future enhancements and out-of-scope EP04
  items open to preserve execution visibility.
- If roadmap governance is desired, create task specs for #143 and #144 so EP04
  can be completed and closed consistently across roadmap/backlog/issues.
