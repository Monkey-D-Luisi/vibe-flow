# Tool Allow-List Rationale

This document explains why each agent in `openclaw.json` can access each tool.
It is used together with `scripts/validate-allowlists.ts`.

> **Naming convention:** Tool names below use dot notation (matching source code).
> Configuration files (`openclaw.json`, `scripts/validate-allowlists.ts`) use
> underscore notation (e.g., `pipeline_advance` instead of `pipeline.advance`).

## pm (Product Manager)

| Tool | Rationale |
|------|-----------|
| `task.create` | Define new work items from product requirements |
| `task.get` | Inspect task details and current status |
| `task.search` | Find related tasks and dependencies |
| `task.update` | Refine title/scope/metadata during grooming |
| `task.transition` | Move tasks from backlog to grooming/design phases |
| `workflow.events.query` | Review event timeline and cost aggregates for planning |
| `project.list` | View all registered projects |
| `project.switch` | Switch active project context for multi-project management |
| `team.assign` | Assign work to specific agents |
| `team.status` | Update own status (available/busy) |
| `team.message` | Communicate with other agents |
| `team.inbox` | Read incoming messages |
| `team.reply` | Respond to agent messages |
| `pipeline.start` | Initiate the roadmap-to-release pipeline from an idea |
| `pipeline.status` | Monitor pipeline progress |
| `pipeline.advance` | Coordinate advancement of any pipeline stage (PM has coordinator access alongside stage owners and tech-lead) |
| `pipeline.metrics` | Review stage timing for planning |
| `pipeline.timeline` | View per-task stage timeline for delivery tracking |
| `decision.evaluate` | Make product decisions (scope, priority, conflict) |
| `decision.log` | Review decision audit trail |
| `decision.outcome` | Tag decisions for completed tasks with success/failure |

## tech-lead (Tech Lead)

| Tool | Rationale |
|------|-----------|
| `task.create` | Create technical tasks (refactors, spikes, tech debt) |
| `task.get` | Inspect task details for architecture decisions |
| `task.search` | Find tasks across projects |
| `task.update` | Attach architecture artifacts and technical notes |
| `task.transition` | Move tasks across design and review checkpoints |
| `workflow.step.run` | Run structured workflow steps (architecture_plan, review_result) |
| `workflow.state.get` | Review guard matrix and transition state |
| `workflow.events.query` | Query event log for delivery analysis |
| `quality.gate` | Evaluate quality policy for release decisions |
| `team.assign` | Delegate work to dev/qa/designer agents |
| `team.status` | Update own status |
| `team.message` | Communicate technical decisions to the team |
| `team.inbox` | Read escalations and messages |
| `team.reply` | Respond to team communications |
| `project.list` | View all registered projects |
| `project.switch` | Switch active project for multi-project oversight |
| `pipeline.status` | Monitor pipeline progress |
| `pipeline.retry` | Retry failed pipeline steps |
| `pipeline.skip` | Skip pipeline steps with justification |
| `pipeline.advance` | Advance pipeline as coordinator |
| `pipeline.metrics` | Review throughput and bottleneck data |
| `pipeline.timeline` | View per-task stage timeline for delivery oversight |
| `decision.evaluate` | Make technical decisions (architecture, quality, scope) |
| `decision.log` | Review past decisions |
| `decision.outcome` | Tag decisions for completed tasks |

## po (Product Owner)

| Tool | Rationale |
|------|-----------|
| `task.create` | Create tasks from refined requirements |
| `task.get` | Inspect task scope and acceptance criteria |
| `task.search` | Find tasks by status for backlog management |
| `task.update` | Refine acceptance criteria and metadata |
| `task.transition` | Move tasks through refinement stages |
| `workflow.step.run` | Run structured steps (requirements refinement output) |
| `workflow.state.get` | Check guard requirements and state |
| `team.message` | Communicate with PM and tech-lead |
| `team.inbox` | Read incoming messages |
| `team.reply` | Respond to queries |
| `team.status` | Update own status |
| `decision.evaluate` | Make scope and conflict decisions |
| `decision.log` | Review decision history |
| `decision.outcome` | Tag decision outcomes |
| `pipeline.advance` | Request pipeline advancement (enforced by caller authorization — only stage owner, pm, or tech-lead can advance) |

## designer (UI/UX Designer)

| Tool | Rationale |
|------|-----------|
| `task.get` | Read design requirements and task context |
| `task.update` | Attach design artifacts in metadata |
| `task.transition` | Move tasks through DESIGN stage |
| `workflow.step.run` | Run structured design steps |
| `workflow.state.get` | Check guard requirements |
| `team.message` | Communicate with front-end and tech-lead |
| `team.inbox` | Read design feedback |
| `team.reply` | Respond to design discussions |
| `decision.evaluate` | Make design decisions |
| `pipeline.advance` | Request pipeline advancement (enforced by caller authorization — only stage owner, pm, or tech-lead can advance) |

## back-1 (Backend Developer)

| Tool | Rationale |
|------|-----------|
| `task.get` | Retrieve implementation requirements |
| `task.update` | Persist implementation notes and outputs |
| `task.transition` | Move work from in-progress to review |
| `workflow.step.run` | Run structured dev steps (dev_result, TDD logs) |
| `workflow.state.get` | Check guard requirements and state |
| `quality.tests` | Execute automated test suite and persist QA report evidence |
| `quality.coverage` | Collect coverage evidence |
| `quality.lint` | Collect lint evidence |
| `quality.complexity` | Collect complexity evidence |
| `quality.gate` | Evaluate quality evidence against scope policy |
| `team.message` | Communicate with tech-lead and QA |
| `team.inbox` | Read review feedback |
| `team.reply` | Respond to reviews |
| `decision.evaluate` | Make implementation decisions |
| `pipeline.advance` | Request pipeline advancement (enforced by caller authorization — only stage owner, pm, or tech-lead can advance) |

## front-1 (Frontend Developer)

| Tool | Rationale |
|------|-----------|
| `task.get` | Retrieve implementation requirements |
| `task.update` | Persist implementation notes and outputs |
| `task.transition` | Move work from in-progress to review |
| `workflow.step.run` | Run structured dev steps (dev_result, TDD logs) |
| `workflow.state.get` | Check guard requirements and state |
| `quality.tests` | Execute automated test suite and persist QA report evidence |
| `quality.coverage` | Collect coverage evidence |
| `quality.lint` | Collect lint evidence |
| `quality.complexity` | Collect complexity evidence |
| `quality.gate` | Evaluate quality evidence against scope policy |
| `team.message` | Communicate with tech-lead, designer, and QA |
| `team.inbox` | Read review feedback |
| `team.reply` | Respond to reviews |
| `decision.evaluate` | Make implementation decisions |
| `pipeline.advance` | Request pipeline advancement (enforced by caller authorization — only stage owner, pm, or tech-lead can advance) |

## qa (QA Engineer)

| Tool | Rationale |
|------|-----------|
| `task.get` | Read acceptance criteria and state |
| `task.update` | Store QA report/evidence |
| `task.transition` | Move tasks from QA to done/rework |
| `workflow.step.run` | Run structured QA steps (qa_report) |
| `workflow.state.get` | Check guard requirements |
| `quality.tests` | Run test suite and capture regression evidence |
| `quality.coverage` | Validate coverage quality gate |
| `quality.lint` | Validate lint quality gate |
| `quality.complexity` | Validate complexity quality gate |
| `quality.gate` | Evaluate overall quality gate verdict |
| `workflow.events.query` | Query event log for test history and patterns |
| `team.message` | Report QA findings to dev agents |
| `team.inbox` | Read QA assignments |
| `team.reply` | Respond to QA discussions |
| `decision.evaluate` | Make quality decisions |
| `pipeline.advance` | Request pipeline advancement (enforced by caller authorization — only stage owner, pm, or tech-lead can advance) |

## devops (DevOps Engineer)

| Tool | Rationale |
|------|-----------|
| `vcs.branch.create` | Create task branches |
| `vcs.pr.create` | Open pull requests |
| `vcs.pr.update` | Amend PR metadata/state |
| `vcs.label.sync` | Synchronize repository labels |
| `task.get` | Read task metadata for PR template and branch naming |
| `task.search` | Discover related tasks for release planning |
| `task.update` | Attach PR/deploy metadata |
| `task.transition` | Advance tasks through shipping stage |
| `workflow.state.get` | Inspect task workflow state during automation |
| `workflow.events.query` | Query timeline and aggregates for release troubleshooting |
| `project.list` | View projects for multi-project deployments |
| `project.switch` | Switch project context |
| `team.message` | Communicate deploy status |
| `team.inbox` | Read deploy requests |
| `team.reply` | Respond to deployment queries |
| `pipeline.status` | Monitor pipeline for shipping readiness |
| `pipeline.advance` | Request pipeline advancement (enforced by caller authorization — only stage owner, pm, or tech-lead can advance) |
| `decision.evaluate` | Make infrastructure decisions |
