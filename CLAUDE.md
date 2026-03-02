# CLAUDE.md - Agent Instructions for OpenClaw Extensions

## Autonomous execution -- read this first

Never create blocking "continue" checkpoints. Execute every workflow atomically from start to PR.
- No mid-task pauses. No "should I proceed?" for steps already in the spec.
- If a tool/command fails: retry once, skip, document in walkthrough -- never stop.
- Read only local files. Never fetch external repos or URLs during execution.
- Genuine ambiguity: use the questionnaire tool before implementation, not mid-task.

## Priority
1. `.agent.md` (governance)
2. Current task in `docs/tasks/`
3. `docs/backlog/` for next work

## Project Overview

Monorepo of extensions, skills, and quality tooling for [OpenClaw](https://openclaw.ai):
- `extensions/product-team/` - Primary product-team plugin (task engine, workflow, quality tools, VCS automation, CI feedback hooks)
- `extensions/quality-gate/` - Standalone quality gate engine/CLI for local and CI quality runs
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

## Registered Tools

### product-team extension (quality.* / task.* / workflow.* / vcs.* / project.* / team.* / decision.* / pipeline.*)

| Tool | Purpose |
|------|---------|
| `task.create` | Create a new task record |
| `task.get` | Fetch a task by ID |
| `task.search` | Search tasks by status, assignee, etc. |
| `task.update` | Update task fields |
| `task.transition` | Transition task to next workflow state |
| `workflow.step.run` | Run a workflow step |
| `workflow.state.get` | Get current workflow state |
| `workflow.events.query` | Query workflow event log |
| `quality.tests` | Run test suite (task-lifecycle-aware) |
| `quality.coverage` | Parse and report test coverage |
| `quality.lint` | Run linter and report violations |
| `quality.complexity` | Measure cyclomatic complexity (AST-based, task-lifecycle-aware) |
| `quality.gate` | Evaluate quality gate policy |
| `vcs.branch.create` | Create a VCS branch |
| `vcs.pr.create` | Create a pull request |
| `vcs.pr.update` | Update an existing pull request |
| `vcs.label.sync` | Sync PR labels |
| `project.list` | List registered projects |
| `project.switch` | Switch active project context |
| `project.register` | Register a new project workspace |
| `team.message` | Post a message to a team channel |
| `team.inbox` | Read team inbox messages |
| `team.reply` | Reply to a team message |
| `team.status` | Update team member status |
| `team.assign` | Assign work to a team member |
| `decision.evaluate` | Evaluate a decision via the decision engine |
| `decision.log` | Log a decision record |
| `pipeline.start` | Start a pipeline |
| `pipeline.status` | Get pipeline status |
| `pipeline.retry` | Retry a failed pipeline step |
| `pipeline.skip` | Skip a pipeline step |

### quality-gate extension (qgate.* — standalone, stateless, no task lifecycle)

| Tool | Purpose |
|------|---------|
| `qgate.complexity` | Measure complexity via regex heuristic (fast CLI scans) |
| `qgate.lint` | Run linter and report violations |
| `qgate.tests` | Run test suite standalone |
| `qgate.coverage` | Parse and report test coverage |
| `qgate.gate` | Evaluate quality gate policy |

> **Note:** `qgate.*` and `quality.*` tools serve different purposes. `quality.*` tools integrate with the task lifecycle. `qgate.*` tools are stateless and work without a task context. Both extensions can be loaded simultaneously — the `qgate.*` namespace prevents tool name collisions.

## Conventions

- Commits: `feat|fix|test|chore|docs(scope): message`
- Branches: `feat/<description>`, `fix/<description>`
- Naming: camelCase for variables/functions, PascalCase for types/interfaces
- Imports: ESM with `.js` extensions
- Testing: Vitest, strict TypeScript, no `any`

## Rules (always)

- English only in repo
- Every task needs matching walkthrough (same filename)
- No secrets in repo
- Prefer file changes over chat explanations
- If conflict: correctness > security > simplicity > consistency
