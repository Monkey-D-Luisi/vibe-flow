# Walkthrough: cr-0165 -- PR #165 Review Hardening

## Task Reference

- Task: `docs/tasks/cr-0165-pr-165-review-hardening.md`
- PR: https://github.com/Monkey-D-Luisi/vibe-flow/pull/165
- Branch: `feat/0005-github-integration`

---

## Summary

Completed a full local review pass for PR #165 and applied all blocking and non-blocking corrective fixes found during the review.

Two findings were actionable:

1. `gh` auth context was unintentionally dropped by process env filtering.
2. `vcs.pr.update` accepted empty label arrays as a no-op update payload.

Both were fixed with regression tests and full quality-gate validation.

---

## Review Scope

- Reviewed the full branch diff against `main` (`git diff main...HEAD`).
- Evaluated correctness, security hardening, architecture boundaries, and tests.
- Ran repository quality gates after fixes.

Note:

- `.agent.md` forbids fetching external URLs during execution, so GitHub comment ingestion and `gh pr checks --watch` were not executed in this run. Review was completed using local diff and test evidence.

---

## MUST_FIX Applied

### 1) `gh` authentication environment dropped

Issue:

- `src/github/spawn.ts` forwarded a very narrow env set and omitted keys used by GitHub CLI to locate local credentials/config (`APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, `HOME`, `XDG_CONFIG_HOME`, `GH_CONFIG_DIR`).
- Reproduced locally: `gh auth status` succeeds with full env and fails with the restricted env used by the wrapper.

Fix:

- Added `REQUIRED_RUNTIME_ENV_KEYS` and always included these keys when present.
- Kept allowlist behavior for other variables.

Tests:

- Added regression test in `test/github/spawn.test.ts` asserting auth-related env keys are preserved in spawn options.

---

## SHOULD_FIX Applied

### 2) `vcs.pr.update` accepted `labels: []` as an update

Issue:

- Service-level update guard treated `labels` presence (even empty) as an update request.
- `GhClient.updatePr` ignores empty labels, so execution became a no-op while still returning success and logging update events.

Fix:

- Added explicit rejection for empty label arrays in `src/github/pr-service.ts`.
- Tightened schema in `src/schemas/vcs-pr-update.schema.ts` (`minItems: 1`).

Tests:

- `test/schemas/vcs.schema.test.ts`: empty labels now rejected by schema.
- `test/github/pr-service.test.ts`: service rejects empty labels.
- `test/tools/vcs-pr-update.test.ts`: tool rejects empty labels payload.

---

## Commands Run

```bash
git diff --name-status main...HEAD
pnpm typecheck
pnpm lint
pnpm test
```

Additional local reproduction command:

```bash
node -e "<spawnSync gh auth status with full env vs restricted env>"
```

---

## Verification

- `pnpm typecheck`: pass
- `pnpm lint`: pass
- `pnpm test`: pass
  - `extensions/product-team`: 34 test files, 212 tests passed
  - `extensions/quality-gate`: 12 test files, 132 tests passed (3 skipped)

---

## Files Changed

| File | Action |
|------|--------|
| `extensions/product-team/src/github/spawn.ts` | Modified |
| `extensions/product-team/src/github/pr-service.ts` | Modified |
| `extensions/product-team/src/schemas/vcs-pr-update.schema.ts` | Modified |
| `extensions/product-team/test/github/spawn.test.ts` | Modified |
| `extensions/product-team/test/github/pr-service.test.ts` | Modified |
| `extensions/product-team/test/tools/vcs-pr-update.test.ts` | Modified |
| `extensions/product-team/test/schemas/vcs.schema.test.ts` | Modified |
| `docs/tasks/cr-0165-pr-165-review-hardening.md` | Created |
| `docs/walkthroughs/cr-0165-pr-165-review-hardening.md` | Created |
