# Walkthrough: 0009 -- CI Webhook Feedback

## Task Reference

- Task: `docs/tasks/0009-ci-webhook-feedback.md`
- Epic: EP04 -- GitHub Integration
- Branch: `feat/0009-ci-webhook-feedback`
- PR: _TBD_

---

## Summary

Implemented EP04/4.4 CI feedback by adding a GitHub CI webhook route to the
`product-team` plugin and a new automation module that:

- normalizes `check_run` and `workflow_run` completed payloads,
- resolves task IDs from `task/<taskId>-<slug>` branch naming,
- updates task metadata with CI check snapshots,
- logs `vcs.ci.feedback` events,
- posts CI summary comments to PRs,
- supports idempotent webhook handling and opt-in auto-transition.

---

## Context

Roadmap task list had no pending task spec while EP04 remained `PENDING`.
Open-issues triage identified issue #144 (CI webhook feedback) as missing scope,
so this task introduced `0009` as the explicit EP04 follow-up execution item.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Use `registerHttpRoute` for CI ingestion | Plugin SDK supports route registration directly; this provides deterministic webhook entrypoint behavior. |
| Support `check_run` + `workflow_run` completed events first | These payloads provide stable completion/conclusion signals for CI status feedback with minimal assumptions. |
| Reuse `ext_requests` idempotency (`withIdempotency`) for webhook dedupe | Prevents duplicate side effects (metadata rewrites, PR comments, auto-transition attempts) on delivery retries. |
| Resolve task from branch prefixes instead of exact split | Handles hyphenated task IDs safely by trying progressively shorter `task/<candidate>-...` prefixes against repository data. |
| Split CI code into `ci-feedback.ts` + `ci-feedback-utils.ts` | Keeps files under repository 500-line limit while preserving cohesive module boundaries. |

---

## Implementation Notes

### Approach

1. Added task/walkthrough docs for `0009` and moved roadmap entry to
   `IN_PROGRESS`.
2. Added CI feedback utilities for payload parsing, request JSON reading,
   branch candidate extraction, and CI comment rendering.
3. Added CI feedback automation class for idempotent handling, metadata updates,
   event logging, PR commenting, and optional transition execution.
4. Wired automation into plugin bootstrap and registered configurable webhook
   route.
5. Extended plugin config schemas/default config with `github.ciFeedback`.
6. Added tests for CI parser/automation behavior and plugin route registration.
7. Executed full workspace quality gates.

### Key Changes

- New webhook route: default `/webhooks/github/ci`.
- New configuration surface:
  - `github.ciFeedback.enabled`
  - `github.ciFeedback.routePath`
  - `github.ciFeedback.commentOnPr`
  - `github.ciFeedback.autoTransition.{enabled,toStatus,agentId}`
- New event logging type for webhook processing: `vcs.ci.feedback`.
- New metadata section maintained on tasks: `metadata.ci` with checks, history,
  and last processed webhook summary.

---

## Commands Run

```bash
git checkout main
git pull origin main
git checkout -b feat/0009-ci-webhook-feedback
pnpm --filter @openclaw/plugin-product-team test
pnpm --filter @openclaw/plugin-product-team lint
pnpm --filter @openclaw/plugin-product-team typecheck
pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `docs/tasks/0009-ci-webhook-feedback.md` | Created | New task spec for EP04 CI webhook feedback follow-up. |
| `docs/walkthroughs/0009-ci-webhook-feedback.md` | Created | Execution evidence for task 0009. |
| `docs/roadmap.md` | Modified | Added task 0009 entry and set to `IN_PROGRESS`. |
| `extensions/product-team/src/github/ci-feedback.ts` | Created | CI webhook automation (idempotency, metadata updates, comments, optional transitions). |
| `extensions/product-team/src/github/ci-feedback-utils.ts` | Created | CI payload normalization, comment builder, branch candidate resolver, request JSON reader. |
| `extensions/product-team/src/index.ts` | Modified | CI feedback config parsing and webhook route registration. |
| `extensions/product-team/openclaw.plugin.json` | Modified | Added `github.timeoutMs`, `github.prBot`, and `github.ciFeedback` config schema fields. |
| `extensions/product-team/test/github/ci-feedback.test.ts` | Created | Unit/integration-style tests for CI feedback parsing and automation side effects. |
| `extensions/product-team/test/index.test.ts` | Modified | Added assertions for CI webhook route registration toggle behavior. |
| `openclaw.json` | Modified | Added default `github.ciFeedback` runtime config block. |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| Product-team | 323 | 323 | N/A |
| Quality-gate | 135 (3 skipped) | 132 | N/A |
| Workspace total | 458 (3 skipped) | 455 | N/A |

---

## Follow-ups

- Add GitHub webhook signature verification (`X-Hub-Signature-256`) for route hardening.
- Add PR comment upsert behavior to avoid comment churn on frequent CI reruns.
- Add support for additional CI payload shapes if repository workflows require them.

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
