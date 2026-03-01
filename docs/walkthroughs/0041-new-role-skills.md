# Walkthrough 0041 -- New Skills for Expanded Roles

## Goal (restated)
Create SKILL.md files for the 6 new agent roles: tech-lead, product-owner,
ui-designer, frontend-dev, backend-dev, devops.

## Decisions
- **One skill per role**: Each SKILL.md defines a single agent persona with
  clear responsibilities, output schemas, and quality standards.
- **Output schemas**: tech-lead uses existing `architecture_plan` and
  `review_result` schemas; product-owner uses existing `po_brief`. frontend-dev
  and backend-dev inherit `dev_result` from tdd-implementation. devops has no
  unique output schema (uses VCS tools directly). Introducing additional schema
  keys would require follow-up changes in the product-team orchestrator.
- **Stitch workflow in ui-designer**: The designer skill enforces `GEMINI_3_PRO`
  model for all Stitch calls, matching saas-template conventions.
- **TDD mandatory for devs**: Both frontend and backend skills mandate the
  Red-Green-Refactor cycle from tdd-implementation.
- **devops agent updated**: `openclaw.docker.json` devops agent now references
  both `devops` and `github-automation` skills for full coverage.

## Files Created
- `skills/tech-lead/SKILL.md` — Task decomposition, architecture decisions, code review
- `skills/product-owner/SKILL.md` — Story refinement, acceptance criteria, scope
- `skills/ui-designer/SKILL.md` — Stitch design, design system, component specs
- `skills/frontend-dev/SKILL.md` — React/Next.js, Stitch-to-code, TDD
- `skills/backend-dev/SKILL.md` — API design, database, TDD
- `skills/devops/SKILL.md` — CI/CD, branches, PRs, deployment

## Files Modified
- `openclaw.docker.json` — devops agent skills updated from `["github-automation"]`
  to `["devops", "github-automation"]`

## Commands Run
```
pnpm test    → 65 test files, 421 tests passed
pnpm lint    → clean across all 9 packages
pnpm typecheck → clean across all 9 packages
```

## Follow-ups
- Validate skill loading in OpenClaw (startup test)
- Refine role boundaries after first pipeline run
