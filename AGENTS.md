# AGENTS.md - Agent Instructions for OpenClaw Extensions

## Plan-first execution -- read this first

Always present a plan and get user approval BEFORE implementing.
- Before any implementation: outline approach, list files to change, wait for approval.
- Any doubt or uncertainty (no matter how small): ask the user, always include a free-text option.
- If a tool/command fails: retry once, then ask the user how to proceed.
- Read only local files. Never fetch external repos or URLs during execution.

## Priority
1. `.agent.md` (governance)
2. Current task in `docs/tasks/`
3. `docs/backlog/` for next work

## Project Overview

Monorepo of extensions, skills, and quality tooling for [OpenClaw](https://openclaw.ai):
- `extensions/product-team/` - Primary product-team plugin (task engine, workflow, quality tools, VCS automation, CI feedback hooks)
- `extensions/quality-gate/` - Standalone quality gate engine/CLI for local and CI quality runs
- `extensions/model-router/` - Per-agent model routing hook
- `extensions/telegram-notifier/` - Telegram notification integration
- `extensions/stitch-bridge/` - Google Stitch MCP design bridge
- `skills/adr/` - ADR management skill
- `skills/architecture-design/` - Architecture design workflow skill
- `skills/backend-dev/` - Backend development skill
- `skills/code-review/` - Code review workflow skill
- `skills/devops/` - DevOps and infrastructure skill
- `skills/frontend-dev/` - Frontend development skill
- `skills/github-automation/` - GitHub automation workflow skill
- `skills/patterns/` - Architecture patterns skill
- `skills/product-owner/` - Product owner workflow skill
- `skills/qa-testing/` - QA/testing workflow skill
- `skills/requirements-grooming/` - Requirements grooming workflow skill
- `skills/tdd-implementation/` - TDD implementation workflow skill
- `skills/tech-lead/` - Tech lead workflow skill
- `skills/ui-designer/` - UI design workflow skill
- `packages/quality-contracts/` - Shared parsers, gate policy, complexity analysis, and validation contracts

## Commands

| Command | Action |
|---------|--------|
| `next task` | Read `.agent/rules/autonomous-workflow.md`, execute |
| `next epic` | Read `.agent/rules/next-epic-workflow.md`, execute |
| `code review` | Read `.agent/rules/code-review-workflow.md`, execute |
| `fast track: <X>` | Read `.agent/rules/fast-track-workflow.md`, execute |
| `full audit` | Read `.agent/rules/full-audit-workflow.md`, execute |
| `process findings` | Read `.agent/rules/findings-processing-workflow.md`, execute |
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
