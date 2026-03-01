# Task: cr-0194 -- EP07 Task Spec Review Fixes

## Metadata

| Field | Value |
|-------|-------|
| Type | Code Review |
| PR | #194 |
| Reviewed Branch | `feat/open-issues-intake-activation` |
| Created | 2026-03-01 |
| Status | DONE |

---

## Findings

| # | Severity | Source | Finding |
|---|----------|--------|---------|
| 1 | MUST_FIX | Copilot (0034:91) | `q:gate` ran before metric-collecting commands — must be last; `q:gate` reads `.qreport/*` artifacts that the preceding commands produce |
| 2 | SHOULD_FIX | Gemini (0033:70) | AC1 "all changed packages" unmeasurable in a monorepo; replaced with registry-comparison criterion |
| 3 | SHOULD_FIX | Gemini (0034:44) | `q:*` command ordering and relationship not clarified in scope or implementation steps |
| 4 | SHOULD_FIX | Codex (roadmap:25) | No `docs/backlog/EP07-*.md` file; autonomous workflow dependency validation fails without it |
| 5 | SHOULD_FIX | Suppressed Copilot (0032:44) | Scaffold used `src/__tests__/` but project convention is top-level `test/` |
| 6 | SHOULD_FIX | Suppressed Copilot (0034:66) | "vulnerability summary" in requirements/AC did not name the command (`verify:vuln-policy`), which is not part of the `q:*` surface |
| 7 | SHOULD_FIX | Suppressed Copilot (0032:85) | Req 1 said "valid npm package name" while impl step said "kebab-case" — misaligned; spec now says kebab-case extension name |
| 8 | NIT | Suppressed Copilot (0033:42/60) | Tag pattern `v*.*.*` in Scope vs `v[0-9]+\.[0-9]+\.[0-9]+` in Requirements — aligned to regex format throughout |

---

## Fixes Applied

- **0032** Scope: `src/__tests__/index.test.ts` → `test/index.test.ts`
- **0032** Req 1: "valid npm package name" → specific kebab-case definition with examples
- **0032** Impl step 6: test path corrected to `tools/create-extension/test/generator.test.ts`
- **0033** Scope: tag pattern aligned to `v[0-9]+\.[0-9]+\.[0-9]+`
- **0033** AC1: clarified to registry-comparison criterion
- **0034** Scope: reordered and named all commands; `q:gate` moved after metrics; `verify:vuln-policy` added
- **0034** Req 5: "vulnerability summary" → explicit `pnpm verify:vuln-policy`
- **0034** Impl step 2: metric commands first, `q:gate` reads artifacts, `verify:vuln-policy` last
- **0033 walkthrough**: Summary clarified—repo-level tag, per-package publish via registry comparison
- **EP07 backlog**: Created `docs/backlog/EP07-dx-platform-ops.md` for autonomous workflow dependency validation

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `docs/tasks/0032-extension-scaffolding-cli.md` | Modified | Test path + name validation requirement |
| `docs/tasks/0033-npm-publish-pipeline.md` | Modified | Tag pattern alignment + AC1 clarification |
| `docs/tasks/0034-ci-quality-gate-workflow-for-prs.md` | Modified | q:gate ordering fix + vuln requirement clarification |
| `docs/walkthroughs/0033-npm-publish-pipeline.md` | Modified | Tagging strategy clarification |
| `docs/backlog/EP07-dx-platform-ops.md` | Created | EP07 backlog file for dependency validation |
