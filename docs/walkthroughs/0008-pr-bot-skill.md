# Walkthrough: 0008 -- PR-Bot Skill Automation

## Task Reference

- Task: `docs/tasks/0008-pr-bot-skill.md`
- Epic: EP04 -- GitHub Integration
- Branch: `feat/0008-pr-bot-skill`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/168

---

## Summary

Implemented PR-Bot automation in `@openclaw/plugin-product-team` via
`after_tool_call` on `vcs.pr.create`.

Delivered behavior:

- metadata-driven auto-labeling (`scope:*`, `epic:*`, `area:*`)
- reviewer assignment from plugin configuration
- PR status comment with task link and checklist
- duplicate-call safety by skipping automation for cached `vcs.pr.create`
  results
- audit event logging via `vcs.pr.bot`

---

## Context

Task `0005` completed core VCS tooling but deferred PR-Bot automation. EP04
remained pending due missing `4.3` and `4.4` behaviors.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Use `after_tool_call` hook on `vcs.pr.create` | Matches EP04 acceptance criteria and avoids coupling automation to tool internals |
| Skip automation for cached duplicate PR create calls | Preserves idempotency and prevents duplicate comments/reviewer assignments |
| Reuse existing `LabelService` + `PrService` for labeling | Keeps idempotency and event-log behavior centralized |
| Add reviewer/comment operations in `GhClient` | Keeps GitHub command execution behind one safe wrapper |

---

## Implementation Notes

### Approach

1. Added a dedicated PR-Bot module (`src/github/pr-bot.ts`) that receives
   `after_tool_call` events and validates applicability (`vcs.pr.create`,
   success path, non-cached result).
2. Derived labels from task data:
   - always `scope:<scope>`
   - `epic:*` from tags/metadata
   - `area:*` from tags/metadata
3. Synced/ensured labels with `LabelService`, then applied them to the PR via
   `PrService.updateTaskPr`.
4. Added reviewer assignment and comment posting to `GhClient`.
5. Registered hook in plugin bootstrap (`src/index.ts`) behind config
   `github.prBot.enabled` (default `true`).
6. Added tests for hook behavior, GH client reviewer/comment commands, and hook
   registration.

### Key Changes

- New module: `extensions/product-team/src/github/pr-bot.ts`
- `GhClient` extended with:
  - `requestReviewers(prNumber, reviewers)`
  - `commentPr(prNumber, body)`
- Plugin bootstrap:
  - parse `github.prBot` config
  - register `api.on('after_tool_call', ...)`
- Docs/config updates:
  - `openclaw.json` PR-Bot config example
  - runbook config snippet
  - API reference side-effect note for `vcs.pr.create`
  - skill doc updated with hook-trigger behavior

---

## Commands Run

```bash
# Branch/workflow
git checkout main
git pull origin main
git checkout -b feat/0008-pr-bot-skill

# Focused verification while implementing
pnpm --filter @openclaw/plugin-product-team test -- test/github/gh-client.test.ts test/github/pr-bot.test.ts test/index.test.ts

# Quality gates
pnpm test
pnpm lint
pnpm typecheck
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/github/pr-bot.ts` | Created | PR-Bot hook logic for labels/reviewers/comments |
| `extensions/product-team/src/github/gh-client.ts` | Modified | Added reviewer assignment and PR comment commands |
| `extensions/product-team/src/index.ts` | Modified | Registered `after_tool_call` hook and PR-Bot config parsing |
| `extensions/product-team/test/github/pr-bot.test.ts` | Created | Hook behavior tests (trigger, cached skip, failures) |
| `extensions/product-team/test/github/gh-client.test.ts` | Modified | Added tests for reviewer/comment GH commands |
| `extensions/product-team/test/index.test.ts` | Modified | Added hook registration tests |
| `docs/tasks/0008-pr-bot-skill.md` | Created | Task specification |
| `docs/walkthroughs/0008-pr-bot-skill.md` | Modified | Final implementation record |
| `docs/roadmap.md` | Modified | Added task 0008 and marked it DONE |
| `docs/runbook.md` | Modified | Added PR-Bot reviewer config snippet |
| `docs/api-reference.md` | Modified | Documented PR-Bot side effect on `vcs.pr.create` |
| `skills/github-automation/SKILL.md` | Modified | Added hook integration workflow details |
| `openclaw.json` | Modified | Added `github.prBot` example config |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| Workspace (`pnpm test`) | Product-team + quality-gate suites | Pass | N/A |
| Workspace lint (`pnpm lint`) | N/A | Pass | N/A |
| Workspace typecheck (`pnpm typecheck`) | N/A | Pass | N/A |
| Product-team focused (`pnpm --filter ...`) | Hook/client/index validations | Pass | N/A |

---

## Follow-ups

- EP04 `4.4 CI webhook feedback` remains pending and should be implemented as a
  dedicated follow-up task.
- Consider comment upsert/edit behavior for PR-Bot status comments if repeated
  manual reruns are expected outside idempotent `vcs.pr.create` flow.

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
