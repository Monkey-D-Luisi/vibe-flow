# Tool Allow-List Rationale

This document explains why each agent in `openclaw.json` can access each tool.
It is used together with `scripts/validate-allowlists.ts`.

## pm (Product Manager)

| Tool | Rationale |
|------|-----------|
| `task.create` | Define new work items from product requirements |
| `task.get` | Inspect task details and current status |
| `task.search` | Find related tasks and dependencies |
| `task.update` | Refine title/scope/metadata during grooming |
| `task.transition` | Move tasks from backlog to grooming/design phases |

## architect (Software Architect)

| Tool | Rationale |
|------|-----------|
| `task.get` | Inspect requirements and current state |
| `task.update` | Attach architecture artifacts in task metadata |
| `task.transition` | Move tasks across design checkpoints |
| `workflow.state.get` | Review transition guards and event history |

## dev (Developer)

| Tool | Rationale |
|------|-----------|
| `task.get` | Retrieve implementation requirements |
| `task.update` | Persist implementation notes and outputs |
| `task.transition` | Move work from in-progress to review |
| `quality.tests` | Execute automated test suite and persist QA report evidence |
| `quality.coverage` | Collect coverage evidence |
| `quality.lint` | Collect lint evidence |
| `quality.complexity` | Collect complexity evidence |
| `quality.gate` | Evaluate all quality evidence against scope policy before release |
| `workflow.step.run` | Run structured workflow steps |
| `workflow.state.get` | Check guard requirements and state |

## qa (QA Engineer)

| Tool | Rationale |
|------|-----------|
| `task.get` | Read acceptance criteria and state |
| `task.update` | Store QA report/evidence |
| `task.transition` | Move tasks from QA to done/rework |
| `quality.tests` | Run test suite and capture regression evidence |
| `quality.coverage` | Validate coverage quality gate |
| `quality.lint` | Validate lint quality gate |
| `quality.complexity` | Validate complexity quality gate |

## reviewer (Code Reviewer)

| Tool | Rationale |
|------|-----------|
| `task.get` | Inspect task scope and implementation details |
| `task.update` | Save review findings in metadata |
| `task.transition` | Return to in-progress or advance to QA |

## infra (Infrastructure Engineer)

| Tool | Rationale |
|------|-----------|
| `vcs.branch.create` | Create task branches |
| `vcs.pr.create` | Open pull requests |
| `vcs.pr.update` | Amend PR metadata/state |
| `vcs.label.sync` | Synchronize labels |
| `task.get` | Read task metadata for PR context |
| `task.search` | Discover related tasks for release planning |
| `workflow.state.get` | Inspect task workflow state during automation |
| `workflow.events.query` | Query timeline and aggregates for release troubleshooting |
