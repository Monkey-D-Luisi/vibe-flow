# CLAUDE.md - Agent Instructions for OpenClaw Extensions

## ⚡ Autonomous execution — read this first

**Never create blocking "continue" checkpoints.** Execute every workflow atomically from start to PR.
- No mid-task pauses. No "should I proceed?" for steps already in the spec.
- If a tool/command fails: retry once, skip, document in walkthrough — never stop.
- Read only local files. Never fetch external repos or URLs during execution.
- **Genuine ambiguity?** Use the questionnaire tool (free, no requests consumed) — ask BEFORE starting, not mid-task.

## Priority
1. `.agent.md` (governance)
2. Current task in `docs/tasks/`
3. `docs/backlog/` for next work

## Project Overview

Monorepo of extensions, skills, and quality tooling for [OpenClaw](https://openclaw.ai):
- `extensions/quality-gate/` - Quality gate extension (test runner, coverage, lint, complexity, gate enforcement)
- `skills/adr/` - ADR management skill
- `skills/patterns/` - Architecture patterns skill
- `packages/schemas/` - Shared JSON Schemas for quality tools

## Commands

| Command | Action |
|---------|--------|
| `next task` | Read `.agent/rules/autonomous-workflow.md`, execute |
| `code review` | Read `.agent/rules/code-review-workflow.md`, execute |
| `fast track: <X>` | Read `.agent/rules/fast-track-workflow.md`, execute |
| `pr` | Read `.agent/rules/pr-workflow.md`, execute |

## Key Commands

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Lint all packages
pnpm lint

# Type-check all packages
pnpm typecheck

# Quality gate CLI
pnpm q:gate --source artifacts --scope minor
pnpm q:tests
pnpm q:coverage
pnpm q:lint
pnpm q:complexity
```

## Conventions

- **Commits**: `feat|fix|test|chore|docs(scope): message`
- **Branches**: `feat/<description>`, `fix/<description>`
- **Naming**: camelCase for variables/functions, PascalCase for types/interfaces
- **Imports**: ESM with `.js` extensions
- **Testing**: Vitest, strict TypeScript, no `any`

## Rules (always)
- English only in repo
- Every task needs matching walkthrough (same filename)
- No secrets in repo
- Prefer file changes over chat explanations
- If conflict: correctness > security > simplicity > consistency
