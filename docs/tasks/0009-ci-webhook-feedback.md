# Task: 0009 -- CI Webhook Feedback

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP04 -- GitHub Integration |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-02-25 |
| Branch | `feat/0009-ci-webhook-feedback` |
| Depends on | 0005 (GitHub VCS tools), 0008 (PR-Bot automation) |

---

## Goal

Implement CI webhook feedback so completed CI status events update task metadata, write auditable event-log entries, and post PR status comments with test/lint/coverage outcomes.

---

## Context

EP04 remains `PENDING` because backlog item 4.4 (CI webhook feedback) is still missing.
Task `0005` delivered VCS tools and `0008` delivered PR-Bot automation, but there is no webhook ingestion path for CI status updates.

Open issue triage (`docs/audits/2026-02-25-open-issues-triage.md`) identifies issue #144 as pending and recommends a dedicated follow-up task.

---

## Scope

### In Scope

- Register an HTTP route in `product-team` plugin for CI webhook ingestion.
- Normalize completed GitHub CI events into a common internal payload.
- Resolve target task from task-branch naming convention.
- Persist CI status summary in task metadata.
- Log CI feedback events into `event_log`.
- Post PR comments with CI check summaries.
- Add opt-in configurable auto-transition attempt for success outcomes.
- Add tests for parser, automation, and plugin registration.

### Out of Scope

- Full GitHub webhook signature hardening and secret rotation policy (EP06 hardening follow-up).
- External queueing/retry infrastructure for webhook delivery.
- New OpenClaw tools for manual CI replay.

---

## Requirements

1. Plugin exposes a dedicated CI webhook route via `registerHttpRoute`.
2. Handler supports completed GitHub `check_run` and `workflow_run` payloads.
3. CI webhook results update task metadata with latest check outcomes.
4. CI webhook processing appends structured `vcs.ci.*` events in `event_log`.
5. If PR number is available, handler posts a CI summary comment to that PR.
6. Auto-transition is opt-in and configurable; failures must be logged without crashing webhook handling.
7. Duplicate webhook deliveries are handled idempotently.

---

## Acceptance Criteria

- [ ] AC1: CI webhook route is registered and reachable through plugin HTTP routing.
- [ ] AC2: Completed `check_run` and `workflow_run` payloads are normalized and mapped to a task.
- [ ] AC3: Task metadata stores CI check results and latest conclusion.
- [ ] AC4: Event log stores CI feedback records for each processed event.
- [ ] AC5: PR comment is posted with CI status summary when PR context is present.
- [ ] AC6: Auto-transition is configurable and only executed when explicitly enabled.
- [ ] AC7: Duplicate webhook payloads do not duplicate side effects.
- [ ] AC8: Tests pass, lint clean, types clean, coverage >= 80% (major).

---

## Constraints

- Use existing `GhClient`/service patterns and repository abstractions.
- Keep implementation local to repository context only (no external fetches).
- Preserve existing VCS/PR-Bot behavior and test contracts.

---

## Implementation Steps

1. Add CI feedback module for payload normalization, metadata updates, and optional transitions.
2. Extend plugin config resolution for CI feedback toggles and route path.
3. Register webhook HTTP route in plugin bootstrap and wire dependencies.
4. Add tests for normalization logic, side effects, and route behavior.
5. Update EP04 docs and walkthrough evidence.

---

## Testing Plan

- Unit tests:
  - CI payload normalization and branch/task resolution logic.
  - CI summary comment rendering.
  - Auto-transition gating logic.
- Integration-like tests:
  - Plugin registers CI webhook route.
  - Route handler updates metadata/logging and posts PR comment for valid payload.
- Regression checks:
  - Existing PR-Bot and VCS tool tests remain green.

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 80% major / >= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] Code reviewed (if applicable)
- [x] PR created and linked

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md)
- [Coding Standards](../../.agent/rules/coding-standards.md)
- [Testing Standards](../../.agent/rules/testing-standards.md)
- [EP04 Backlog](../backlog/EP04-github-integration.md)
- [Task 0005](0005-github-integration.md)
- [Task 0008](0008-pr-bot-skill.md)
