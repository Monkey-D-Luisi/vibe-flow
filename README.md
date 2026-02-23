# OpenClaw Extensions -- Product Team

Extensions, plugins, and skills for [OpenClaw](https://openclaw.ai) that implement a **product-team workflow** of AI agents. The plugin system orchestrates specialized agents (PM, Architect, Dev, QA, Reviewer, Infra) through a contract-driven state machine with quality gates.

## Overview

This monorepo contains:

- **`extensions/product-team/`** -- OpenClaw plugin implementing the Task Engine: TaskRecord lifecycle, state machine, quality gates, GitHub automation, and agent orchestration.
- **`skills/`** -- OpenClaw skills for each product-team role (requirements grooming, architecture design, TDD implementation, code review, QA testing, GitHub automation).
- **`openclaw.json`** -- Multi-agent configuration with tool policies and skill assignments per role.

## Architecture

```
User / Stakeholder
    |
    v
OpenClaw Gateway (sessions, routing, tools, sandbox)
    |
    +-- PM Agent       --> task.create, task.transition
    +-- Architect Agent --> task.get, workflow.state.*
    +-- Dev Agent       --> quality.*, workflow.*, task.transition
    +-- QA Agent        --> quality.*, task.transition
    +-- Reviewer Agent  --> task.get, task.transition
    +-- Infra Agent     --> vcs.*, task.transition
    |
    v
Plugin: product-team
    |
    +-- Task Engine (SQLite + event log + leases)
    +-- Quality Gates (coverage, lint, complexity, TDD)
    +-- GitHub Automation (branch, PR, labels, project)
```

### State Machine

```
PO --> Architect --> Dev --> Review --> PO Check --> QA --> PR --> Done
         |
         v
       Dev (fast-track for minor scope)
```

## Prerequisites

- [OpenClaw](https://openclaw.ai) installed and Gateway running
- Node.js 22+
- pnpm

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Monkey-D-Luisi/agents-mcps.git
cd agents-mcps

# Install dependencies
pnpm install

# Run tests
pnpm test

# Lint and type-check
pnpm lint
pnpm typecheck
```

## Development

```bash
pnpm test          # Run all tests
pnpm lint          # Lint all packages
pnpm typecheck     # Type-check all packages
pnpm build         # Build all packages
```

## Project Structure

```
agents-mcps/
  .agent.md                    # Agent governance (single source of truth)
  .agent/rules/                # Workflow and standards definitions
  .agent/templates/            # Task, walkthrough, ADR, PR review templates
  .claude/commands/            # Claude Code slash commands
  CLAUDE.md                    # Claude Code instructions
  AGENTS.md                    # Generic agent instructions
  openclaw.json                # OpenClaw multi-agent configuration
  extensions/
    product-team/              # OpenClaw plugin
      src/
        domain/                # TaskRecord, FastTrack (pure logic)
        persistence/           # SQLite repositories
        orchestrator/          # State machine, router, runner
        quality/               # Quality gate evaluation
        github/                # GitHub automation (Octokit)
        tools/                 # OpenClaw tool registrations
        schemas/               # JSON Schemas
      test/                    # Vitest tests
  skills/
    requirements-grooming/     # PM skill
    architecture-design/       # Architect skill
    tdd-implementation/        # Dev skill
    code-review/               # Reviewer skill
    qa-testing/                # QA skill
    github-automation/         # Infra skill
  docs/
    roadmap.md                 # 6-month phased plan
    backlog/                   # Epic specifications
    tasks/                     # Task specifications
    walkthroughs/              # Implementation journals
    adr/                       # Architecture Decision Records
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for the full 6-month plan.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and PR process.

## License

MIT -- see [LICENSE](LICENSE) for details.
