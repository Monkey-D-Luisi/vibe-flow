# Copilot Instructions -- OpenClaw Extensions

## Project Context

This is an OpenClaw extensions monorepo containing quality gate tooling, skills,
and quality tooling. Tech stack: TypeScript ESM, Node 22+, pnpm workspaces, Vitest.

## Conventional Commits

All commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/).

Format: `type(scope): subject`

### Types

- `feat` -- New feature
- `fix` -- Bug fix
- `docs` -- Documentation only
- `style` -- Formatting, whitespace (no logic change)
- `refactor` -- Code restructuring (no behavior change)
- `perf` -- Performance improvement
- `test` -- Adding or updating tests
- `build` -- Build system or dependencies
- `ci` -- CI/CD configuration
- `chore` -- Maintenance, configs
- `revert` -- Reverting a previous commit

### Scopes

- `quality-gate` -- Quality gate extension in `extensions/quality-gate/`
- `product-team` -- Product team plugin in `extensions/product-team/`
- `model-router` -- Model routing hook in `extensions/model-router/`
- `telegram-notifier` -- Telegram notifier in `extensions/telegram-notifier/`
- `stitch-bridge` -- Stitch bridge in `extensions/stitch-bridge/`
- `quality-contracts` -- Quality contracts in `packages/quality-contracts/`
- `skills` -- Skill definitions in `skills/`
- `docs` -- Documentation in `docs/`
- `ci` -- CI/CD workflows in `.github/`

### Rules

- Subject: imperative mood, lowercase, no trailing period, max 72 chars.
- Header total: max 120 chars.
- Body (optional): motivation and context in prose.
- Footer (optional): `BREAKING CHANGE:` or issue references.
- When multiple areas change, use the most relevant scope or omit it.

### Examples

```
feat(quality-gate): add ruff parser support
fix(quality-gate): correct coverage ratio clamping
docs: update README with CLI usage
test(quality-gate): add integration tests for gate policy
ci: add coverage threshold check to PR workflow
```

## Commands

| Command | Rule file |
|---------|-----------|
| `next task` | `.agent/rules/autonomous-workflow.md` |
| `code review` | `.agent/rules/code-review-workflow.md` |
| `fast track: <X>` | `.agent/rules/fast-track-workflow.md` |
| `full audit` | `.agent/rules/full-audit-workflow.md` |
| `process findings` | `.agent/rules/findings-processing-workflow.md` |
| `pr` | `.agent/rules/pr-workflow.md` |

## Quality Gates

| Gate | Threshold |
|------|-----------|
| Test coverage (major) | >= 80% |
| Test coverage (minor) | >= 70% |
| Lint errors | 0 |
| TypeScript errors | 0 |
| Avg cyclomatic complexity | <= 5.0 |

## Architecture Principles

- **Extension pattern**: `register(api)` entry point, `openclaw.plugin.json` manifest.
- **ESM** with `.js` extensions in import paths.
- **No `any`** -- use `unknown` + type guards.
- Files under 500 LOC.

## Code Style

- TypeScript 5+ strict mode
- 2-space indent, single quotes, trailing commas
- Async/await over raw promises
- No bare catch blocks -- always log with context

## Governance

The single source of truth is `.agent.md`. See `.agent/rules/` for detailed
standards and workflows.
