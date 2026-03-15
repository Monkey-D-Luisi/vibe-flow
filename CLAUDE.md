# CLAUDE.md - Agent Instructions for OpenClaw Extensions

## Plan-first execution -- read this first

Always present a plan and get user approval BEFORE implementing. Use plan mode to agree on details.
- Before any implementation: enter plan mode, outline approach, wait for approval.
- Any doubt or uncertainty (no matter how small): use the questionnaire tool with a free-text field.
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

> **Note:** `skills/` directories are Markdown-only prompt libraries (each containing a `SKILL.md`). They are intentionally excluded from `pnpm-workspace.yaml` since they have no package.json or build artifacts.

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

## Registered Tools

> **Note:** Tool names are registered with dots rewritten as underscores (e.g. `task_create` not `task.create`).

### product-team extension

| Tool | Purpose |
|------|---------|
| `task_create` | Create a new task record |
| `task_get` | Fetch a task by ID |
| `task_search` | Search tasks by status, assignee, etc. |
| `task_update` | Update task fields |
| `task_transition` | Transition task to next workflow state |
| `workflow_step_run` | Run a workflow step |
| `workflow_state_get` | Get current workflow state |
| `workflow_events_query` | Query workflow event log |
| `quality_tests` | Run test suite (task-lifecycle-aware) |
| `quality_coverage` | Parse and report test coverage |
| `quality_lint` | Run linter and report violations |
| `quality_complexity` | Measure cyclomatic complexity (AST-based, task-lifecycle-aware) |
| `quality_gate` | Evaluate quality gate policy |
| `vcs_branch_create` | Create a VCS branch |
| `vcs_pr_create` | Create a pull request |
| `vcs_pr_update` | Update an existing pull request |
| `vcs_label_sync` | Sync PR labels |
| `project_list` | List registered projects |
| `project_switch` | Switch active project context |
| `project_register` | Register a new project workspace |
| `team_message` | Post a message to a team channel |
| `team_inbox` | Read team inbox messages |
| `team_reply` | Reply to a team message |
| `team_status` | Update team member status |
| `team_assign` | Assign work to a team member |
| `decision_evaluate` | Evaluate a decision via the decision engine |
| `decision_log` | Log a decision record |
| `decision_outcome` | Tag decisions for a completed task with success/overridden/failed outcome |
| `pipeline_start` | Start a pipeline |
| `pipeline_status` | Get pipeline status |
| `pipeline_retry` | Retry a failed pipeline step |
| `pipeline_skip` | Skip a pipeline step |
| `pipeline_advance` | Advance a pipeline to its next stage |
| `pipeline_metrics` | Get pipeline stage timing and throughput metrics |
| `pipeline_timeline` | Per-task ordered timeline of stages with timestamps and durations |

### quality-gate extension (standalone, stateless, no task lifecycle)

| Tool | Purpose |
|------|---------|
| `qgate_complexity` | Measure complexity via regex heuristic (fast CLI scans) |
| `qgate_lint` | Run linter and report violations |
| `qgate_tests` | Run test suite standalone |
| `qgate_coverage` | Parse and report test coverage |
| `qgate_gate` | Evaluate quality gate policy |

> **Note:** `qgate_*` and `quality_*` tools serve different purposes. `quality_*` tools integrate with the task lifecycle. `qgate_*` tools are stateless and work without a task context. Both extensions can be loaded simultaneously — the `qgate_*` namespace prevents tool name collisions.
>
> **Complexity tool comparison:** `quality_complexity` uses AST-based analysis (ts-morph) and produces higher, more accurate scores. `qgate_complexity` uses regex heuristics and produces lower, faster-to-compute scores. Results from the two tools are not directly comparable.

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
