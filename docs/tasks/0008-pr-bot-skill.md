# Task: 0008 -- PR-Bot Skill Automation

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP04 -- GitHub Integration |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-25 |
| Branch | `feat/0008-pr-bot-skill` |
| Depends on | 0005 (GitHub VCS tools done) |

---

## Goal

Implement PR-Bot automation so PRs created through `vcs.pr.create` are enriched
automatically with metadata-driven labels, configured reviewers, and a status
comment posted through OpenClaw hook integration.

---

## Context

Task `0005` delivered idempotent VCS operations (`vcs.branch.create`,
`vcs.pr.create`, `vcs.pr.update`, `vcs.label.sync`) but explicitly deferred
PR-Bot automation. EP04 backlog and issue `#143` still require:

- auto-label on PR creation,
- reviewer auto-assignment,
- status comment posting,
- integration through `after_tool_call`.

---

## Scope

### In Scope

- Hook handler for `after_tool_call` events when tool is `vcs.pr.create`
- Auto-label derivation from task metadata (scope, epic, area)
- Reviewer assignment from plugin configuration
- PR status comment with task link and checklist
- Tests for hook behavior and GitHub client integration points

### Out of Scope

- CI webhook/status-check ingestion (`4.4`, tracked separately)
- Merge gating or branch protection configuration
- Replacing existing PR body template behavior

---

## Requirements

1. Hook runs only for successful `vcs.pr.create` executions.
2. PR labels are derived from task metadata and include `scope:*`, `epic:*`,
   and `area:*` when data exists.
3. Reviewers are assigned from plugin config (scope-aware fallback allowed).
4. PR status comment includes task link and checklist summary.
5. Hook side effects are skipped for cached duplicate `vcs.pr.create` results.
6. Failures in PR-Bot automation are logged but must not break tool execution.

---

## Acceptance Criteria

- [ ] AC1: PRs are labelled automatically on creation using task metadata.
- [ ] AC2: Reviewers are assigned based on configuration.
- [ ] AC3: Status comment is posted with task link and checklist.
- [ ] AC4: Automation is integrated through `after_tool_call` on `vcs.pr.create`.
- [ ] AC5: Tests pass, lint clean, types clean, coverage >= 80% (major).

---

## Constraints

- Use existing `gh` wrapper patterns and repository services.
- Keep EP04 implementation idempotent and auditable through event logging.
- No external network/docs fetches; local repository context only.

---

## Implementation Steps

1. Add PR-Bot hook module and configuration resolver in product-team plugin.
2. Extend GitHub client/service capabilities for reviewer assignment and comments.
3. Register the hook in plugin bootstrap and wire dependencies.
4. Add tests for label/reviewer/comment flows and duplicate-call protection.
5. Update EP04 docs/walkthrough and close issue linkage.

---

## Testing Plan

- Unit tests:
  - label derivation and reviewer resolution
  - hook gating by tool name/success/cached result
- Integration-like tests:
  - plugin registers `after_tool_call` hook
  - hook invokes label sync, reviewer assignment, and status comment paths
- Regression checks:
  - existing VCS tools behavior remains unchanged

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 80% major / >= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [ ] Code reviewed (if applicable)
- [x] PR created and linked (#168)

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md)
- [Coding Standards](../../.agent/rules/coding-standards.md)
- [Testing Standards](../../.agent/rules/testing-standards.md)
- [EP04 Backlog](../backlog/EP04-github-integration.md)
- [Task 0005](0005-github-integration.md)
